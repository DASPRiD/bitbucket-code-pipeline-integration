# Bitbucket CodePipeline Integration

A simple Serverless project to assist in integrating on-premise Bitbucket with AWS CodePipeline.

This project is different from the way found on the
[AWS blog](https://aws.amazon.com/blogs/devops/integrating-codepipeline-with-on-premises-bitbucket-server/), as this
project utilizes `git archive` via SSH to retrieve the ZIP file, instead of using a personal access token. The advantage
of this is that you don't have to store a personal access token which can a) expire and b) grants read access to all
repositories on your Bitbucket server.

The setup of this integration is also a lot easier and only involves a few steps.

## Setup

1. Install Serverless Framework:

    https://www.serverless.com/framework/docs/getting-started

2. Deploy this application:

    ```bash
    sls deploy
    ```
   
3. Set up the following SMS parameters:

    - `/bitbucket-code-pipeline-integration/default/gitAuthority`
      - E. g. `git@bitbucket-hostname:7999`
    - `/bitbucket-code-pipeline-integration/default/knownHosts`
      - Generated via `ssh-keyscan -p 7999 bitbucket-hostname > bitbucketKey` 
    - `/bitbucket-code-pipeline-integration/default/sshKey`
      - Private key with read access to your repositories  
    - `/bitbucket-code-pipeline-integration/default/signingSecret`
      - Bitbucket signing secret

    > Note: You should store the `sshKey` and `signingSecret` parameters as secret text!

4. Set up the webhooks in your Bitbucket repositories pointing to the endpoint given to you by the deploy command.

5. Set up your CodePipeline to source from the created S3 bucket.
