import {APIGatewayProxyEventV2, APIGatewayProxyResultV2} from 'aws-lambda';
import {S3} from 'aws-sdk';
import {spawn} from 'child_process';
import {createHmac, randomUUID} from 'crypto';
import {promises as fs} from 'fs';
import 'source-map-support/register';
import {Readable} from 'stream';
import {getConfig} from './config';

const s3 = new S3();

export const webhookHandler = async (event : APIGatewayProxyEventV2) : Promise<APIGatewayProxyResultV2> => {
    const config = await getConfig([
        '/signingSecret',
        '/gitAuthority',
        '/knownHosts',
        '/sshKey',
    ]);

    if (!event.body) {
        return {statusCode: 400, body: 'Body missing'};
    }

    const headers = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));

    if (headers['x-event-key'] === 'diagnostics:ping') {
        return {statusCode: 204};
    }

    if (!headers['x-hub-signature']) {
        return {statusCode: 403, body: 'Signature missing'};
    }

    const hash = createHmac('sha256', config['/signingSecret']).update(event.body).digest('hex');
    const [, signatureHash] = headers['x-hub-signature'].split('=');

    if (signatureHash !== hash) {
        return {statusCode: 403, body: 'Signature mismatch'};
    }

    const body = JSON.parse(event.body) as EventPayload;

    const sshKeyFilename = `/tmp/${randomUUID()}`;
    await fs.writeFile(sshKeyFilename, config['/sshKey']);
    await fs.chmod(sshKeyFilename, 0o400);

    const knownHostsFilename = `/tmp/${randomUUID()}`;

    try {
        for (const change of body.changes) {
            if (change.ref.type !== 'BRANCH') {
                continue;
            }

            // SSH modifies the known hosts file, so we have to re-create it after each run, otherwise subsequent runs
            // will fail.
            await fs.writeFile(knownHostsFilename, config['/knownHosts']);

            const zip = await archiveBranch(
                sshKeyFilename,
                knownHostsFilename,
                config['/gitAuthority'],
                `${body.repository.project.key}/${body.repository.name}`,
                change.ref.displayId
            );

            await s3.upload({
                Bucket: process.env.S3_BUCKET as string,
                ServerSideEncryption: 'AES256',
                Key: `${body.repository.project.key}/${body.repository.name}/${change.ref.displayId}.zip`,
                Body: zip,
            }).promise();
        }
    } finally {
        await fs.rm(sshKeyFilename);
        await fs.rm(knownHostsFilename);
    }

    return {statusCode: 204};
};

const archiveBranch = async (
    sshKeyFilename : string,
    knownHostsFilename : string,
    gitAuthority : string,
    repository : string,
    branch : string
) : Promise<Readable> => {
    const child = spawn(
        'git',
        [
            'archive',
            '--remote',
            `ssh://${gitAuthority}/${repository}.git`,
            '--format',
            'zip',
            '-1',
            branch,
        ],
        {
            env: {
                ...process.env,
                'GIT_SSH_COMMAND': `ssh -i ${sshKeyFilename} -o UserKnownHostsFile=${knownHostsFilename}`,
            },
        },
    );

    child.stderr.on('data', chunk => {
        console.error(chunk.toString());
    });

    child.on('close', code => {
        if (code && code > 0) {
            throw new Error('GIT archive failed');
        }
    });

    return child.stdout;
};

type EventPayload = {
    repository : {
        name : string;
        project : {
            key : string;
        };
    };
    changes : Array<{
        ref : {
            id : string;
            displayId : string;
            type : 'BRANCH';
        };
    }>;
};
