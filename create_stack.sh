#!/bin/bash
readonly AWS_PROFILE=andy
readonly AWS_STACK_NAME=andytest  # Stick to lowercase or s3 breaks
readonly AWS_CODE_BUCKET=andytest-061681

readonly API_DOMAIN_ROOT=aedvalson.net.
readonly API_DOMAIN=api.aedvalson.net
readonly API_CERT_ARN=arn:aws:acm:us-east-1:942312807340:certificate/f4016245-8123-4d51-91c9-4187c97f7fbe  # Create this in AWS before proceeding
readonly CODE_COMMIT_BRANCH=master

readonly LAMBDA_SRC_DIR=./lambda_src

# Create code bucket
aws s3 mb s3://${AWS_CODE_BUCKET} --profile ${AWS_PROFILE}

# Upload Lambda source
(cd ${LAMBDA_SRC_DIR}; zip -r /tmp/lambda.zip *)
aws s3 mv /tmp/lambda.zip s3://${AWS_CODE_BUCKET}/${AWS_STACK_NAME}}/lambda.zip --profile ${AWS_PROFILE}

# Update Stack
aws cloudformation create-stack \
    --profile ${AWS_PROFILE} \
    --parameters \
        ParameterKey=ApiDomainName,ParameterValue=${API_DOMAIN} \
        ParameterKey=ApiCertificateArn,ParameterValue=${API_CERT_ARN} \
        ParameterKey=ApiDomainRoot,ParameterValue=${API_DOMAIN_ROOT} \
        ParameterKey=LambdaBucket,ParameterValue=${AWS_CODE_BUCKET} \
        ParameterKey=CodeCommitBranch,ParameterValue=${CODE_COMMIT_BRANCH} \
    --capabilities CAPABILITY_IAM \
    --stack-name ${AWS_STACK_NAME} \
    --template-body file://<(node_modules/.bin/cloudform --minify aws-template.ts)
