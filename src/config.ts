import {SSM} from 'aws-sdk';

const ssm = new SSM();

export const getConfig = async <TName extends string>(names : TName[]) : Promise<Record<TName, string>> => {
    const prefix = `/bitbucket-code-pipeline-integration/${process.env.AWS_STAGE}`;
    const parametersResult = await ssm.getParameters({
        Names: names.map(name => `${prefix}${name}`),
        WithDecryption: true,
    }).promise();

    if (!parametersResult.Parameters || parametersResult.Parameters.length !== names.length) {
        throw new Error('Could not retrieve SSM parameters');
    }

    return Object.fromEntries(parametersResult.Parameters.map(parameter => {
        const name = parameter.Name;
        const value = parameter.Value;

        if (!name || !value) {
            throw new Error('SSM parameter is empty');
        }

        return [name.substr(prefix.length), value];
    })) as Record<TName, string>;
};
