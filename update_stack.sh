#!/bin/bash
readonly AWS_PROFILE=daypacer
readonly AWS_STACK_NAME=call-collector  # Stick to lowercase or s3 breaks
readonly AWS_CODE_BUCKET=daypacer-call-collector-source

readonly API_DOMAIN_ROOT=daypacerapi.com.
readonly API_DOMAIN=posts.daypacerapi.com
readonly API_CERT_ARN=arn:aws:acm:us-east-1:667410063595:certificate/e77ea246-4cf6-44ed-b506-f7f842b8a472

readonly CODE_COMMIT_BRANCH=master

readonly SQS_CONSUMER_LAMBDA=''
readonly INBOUND_PROCESSOR_LAMBDA=''
readonly OUTBOUND_PROCESSOR_LAMBDA=''

# Emptry code bucket for Lambda upload
aws s3 rm s3://${AWS_CODE_BUCKET} --recursive --profile ${AWS_PROFILE}

# Upload Lambda source
(cd [[SOURCE_DIR]]; zip -r /tmp/lambda.zip *)
aws s3 mv /tmp/lambda.zip s3://${AWS_CODE_BUCKET}/[[APP_NAME]]/lambda.zip --profile ${AWS_PROFILE}
aws lambda update-function-code --function-name call-collector-ConsumerLambda-1K4929IO7BB96 --s3-bucket ${AWS_CODE_BUCKET} --s3-key consumer/lambda.zip --profile ${AWS_PROFILE}

# Update Stack
aws cloudformation update-stack \
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
