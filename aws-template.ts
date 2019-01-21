import cloudform, { Lambda, IAM, Fn, Refs, ApiGateway, CodePipeline, CodeBuild, RDS, EC2, S3, SQS, Events, CertificateManager, StringParameter, Route53, SNS, CloudWatch, SES, SSM, CloudFormation } from 'cloudform';

// Roles
const LambdaExecutionRole = 'LambdaExecutionRole';

// Email
const SESReceiptRuleSet = 'SESReceiptRuleSet';

// Lambda Setup
const ConsumerLambda = 'ConsumerLambda'
const ConsumerLambdaHandler = 'index.handler'
const ConsumerLambdaZipFile = 'consumer/lambda.zip'

// S3
const FileStorageBucket = 'FileStorageBucket'

// VPC
const ElasticIP = 'ElasticIP'
const CallCollectorVPC = 'CallCollectorVPC'
const CallCollectorVPCSecurityGroup = 'CallCollectorVPCSecurityGroup'
const CallCollectorVPCSubnet = 'CallCollectorVPCSubnet'
const CallCollectorVPCSubnet2 = 'CallCollectorVPCSubnet2'
const PrivateRouteTable = 'PrivateRouteTable'
const PublicRouteTable = 'PublicRouteTable'
const CallCollectorVPCGateway = 'CallCollectorVPCGateway'
const CallCollectorVPCGatewayAttachment = 'CallCollectorVPCGatewayAttachment'
const CallCollectorVPCSubnetRouteAssociation = 'CallCollectorVPCSubnetRouteAssociation'

// Database
const DBName = 'DaypacerCallCollector'
const MySqlDBSubnetGroup = 'MySqlDBSubnetGroup'
const MySqlDBInstance = 'MySqlDBInstance'
const MySqlDBInstanceParameters = 'MySqlDBInstanceParameters'

// API Setup
const InboundCallAPI = 'InboundCallAPI'
const InboundCallApiStage = 'InboundCallApiStage'
const InboundCallAPIDeploy = 'InboundCallAPIDeploy'
const InboundCallAPIName = 'CallsAPI'
const SampleResource = 'SampleResource'
const SampleResourceOptionsMethod = 'SampleResourceOptionsMethod'

// Code Pipeline
const CodePipelineRole = 'CodePipelineRole'

// Code Build
const CodeBuildArtifactBucket = "CodeBuildArtifactBucket"
const CodeBuildProject = 'CodeBuildProject'

const DBUSERNAME = 'DBUSERNAME'
const DBPASSWORD = 'DBPASSWORD'
//Params

export default cloudform({

    Parameters: {
        ApiDomainName: new StringParameter({
            Description: 'Domain Name for Calls API Endpoints'
        }),
        ApiDomainRoot: new StringParameter({
            Description: 'Domain Name for Calls API Endpoints'
        }),
        ApiCertificateArn: new StringParameter({
            Description: 'ARN of Certificate for Calls API domain name in ACM'
        }),
        LambdaBucket: new StringParameter({
            Description: "Name of S3 Bucket to store deployed Lambda code"
        }),
        CodeCommitBranch: new StringParameter({
            Description: "CodeCommit Branch to deploy Lambdas from"
        }),
    },

    Outputs: {
    },

    Resources: {
        // Parameters
        [DBUSERNAME]: new SSM.Parameter({
            Name: Fn.Join('_', [Refs.StackName, 'db_username']),
            Value: 'DBUser',  // TODO: Get this from command line or .env
            Type: 'String'
        }),
        [DBPASSWORD]: new SSM.Parameter({
            Name: Fn.Join('_', [Refs.StackName, 'db_password']),
            Value: '!@#$%^&',  // TODO: Get this from command line or .env
            Type: 'String'
        }),

        // DNS
        RecordSet: new Route53.RecordSetGroup({
            HostedZoneName: Fn.Ref('ApiDomainRoot'),
            RecordSets: [{
                Name: Fn.Ref('ApiDomainName'),
                Type: 'CNAME',
                TTL: '300',
                ResourceRecords: [
                    Fn.Join('', [Fn.Ref(InboundCallAPI), '.execute-api.us-west-2.amazonaws.com'])
                ]
            }]
        }),

        [ConsumerLambda]: new Lambda.Function ({
            Handler: ConsumerLambdaHandler,
            Role: Fn.GetAtt(LambdaExecutionRole, "Arn"),
            Runtime: "nodejs8.10",
            Timeout: 180,
            MemorySize: 2048, // Lots of ram so we can open big files
            Code: {
                S3Bucket: Fn.Ref('LambdaBucket'),
                S3Key: ConsumerLambdaZipFile
            },
            Environment: {
                Variables: {
                    "NODE_ENV": "production",
                    "DB_HOST": Fn.GetAtt(MySqlDBInstance, "Endpoint.Address"),
                    "DB_PORT": Fn.GetAtt(MySqlDBInstance, "Endpoint.Port"),
                    "DB_USERNAME": "root", // Todo
                    "DB_PASS_PARAM": Fn.Ref(DBPASSWORD),
                    "DB_NAME": DBName,
                }
            },
        }),

        [LambdaExecutionRole]: new IAM.Role({
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Effect: "Allow",
                        Principal: { Service: ["apigateway.amazonaws.com", "lambda.amazonaws.com"] },
                        Action: ["sts:AssumeRole"]
                    }
                ]
            },
            Path: "/",
            ManagedPolicyArns: [
                "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
                "arn:aws:iam::aws:policy/AmazonEC2FullAccess",
                "arn:aws:iam::aws:policy/AmazonSQSFullAccess",
                "arn:aws:iam::aws:policy/AWSLambdaFullAccess"
                 // TODO: Too much access
            ],
            Policies: [
                {
                    PolicyName: "simpledb_s3_policy",
                    PolicyDocument: {
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Sid: "Stmt1535066743000",
                                Effect: "Allow",
                                "Action": [
                                    "s3:*",
                                    "lambda:InvokeAsync",
                                    "lambda:InvokeFunction",
                                    "ssm:*",
                                    "sns:Publish"
                                ],
                                "Resource": [
                                    "*"
                                ]
                            },
                            {
                                Effect: "Allow",
                                "Action": [
                                    "ssm:getParameter",
                                    "ssm:getParameters"
                                ],
                                "Resource": [
                                    Fn.Join(':', [
                                        'arn',
                                        'aws',
                                        'ssm',
                                        Refs.Region,
                                        Refs.AccountId,
                                        'parameter/*'
                                    ])
                                ]
                            }
                        ]
                    }
                }
            ],
        }),


        [FileStorageBucket]: new S3.Bucket({
            BucketName:  Fn.Join('-', ['dp', Refs.StackName, 'files']),
            AccessControl: "PublicRead",
        }),


        [CodeBuildArtifactBucket]: new S3.Bucket({
            BucketName:  Fn.Join('-', ['dp', Refs.StackName, 'artifacts']),
            AccessControl: "PublicRead",
        }),

        CodeBuildArtifactBucketPolicy: new S3.BucketPolicy({
            Bucket: Fn.Ref(CodeBuildArtifactBucket),
            PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: ["s3:PutObject", "s3:GetObject", "s3:PutObjectAcl"],
                        Effect: "Allow",
                        Resource: [Fn.Join('', ["arn:aws:s3:::", Fn.Ref(CodeBuildArtifactBucket) , "/*" ] )],
                        Principal: '*' // TODO: Restrict this
                    }, {
                        Action: ["s3:ListBucket"],
                        Effect: "Allow",
                        Resource:  [Fn.Join('', ["arn:aws:s3:::", Fn.Ref(CodeBuildArtifactBucket) ] )],
                        Principal: '*'
                    }
                ]
            }
        }),

        // VPC
        [CallCollectorVPC]: new EC2.VPC ({
            CidrBlock: "10.0.0.0/16",
            EnableDnsHostnames: true,
            EnableDnsSupport: true
        }),

        [CallCollectorVPCSubnet]: new EC2.Subnet({
            CidrBlock: "10.0.1.0/24",
            VpcId: Fn.Ref(CallCollectorVPC),
            MapPublicIpOnLaunch: true,
            AvailabilityZone: "us-west-2a",
        }),

        [CallCollectorVPCSubnet2]: new EC2.Subnet({
            CidrBlock: "10.0.2.0/24",
            VpcId: Fn.Ref(CallCollectorVPC),
            AvailabilityZone: "us-west-2b"
        }),

        [CallCollectorVPCSubnetRouteAssociation]: new EC2.SubnetRouteTableAssociation({
            RouteTableId: Fn.Ref(PrivateRouteTable),
            SubnetId: Fn.Ref(CallCollectorVPCSubnet2)
        }),

        PublicCallCollectorVPCSubnetRouteAssociation2: new EC2.SubnetRouteTableAssociation({
            RouteTableId: Fn.Ref(PublicRouteTable),
            SubnetId: Fn.Ref(CallCollectorVPCSubnet)
        }),

        [CallCollectorVPCSecurityGroup]: new EC2.SecurityGroup({
            GroupDescription: "Security rules for Call Collector DB Cluster VPC",
            GroupName: "CallCollectorVPCSG",
            VpcId: Fn.Ref(CallCollectorVPC),
            SecurityGroupIngress: [{
                IpProtocol: 'tcp',
                FromPort: 0,
                ToPort: 65535,
                CidrIp: '0.0.0.0/0'
            }],
            SecurityGroupEgress: [
                {
                    IpProtocol : "tcp",
                    FromPort : 0,
                    ToPort : 65535,
                    CidrIp : "0.0.0.0/0"
                }
            ]
        }),

        [CallCollectorVPCGateway]: new EC2.InternetGateway({}),

        [CallCollectorVPCGatewayAttachment]: new EC2.VPCGatewayAttachment({
            InternetGatewayId: Fn.Ref(CallCollectorVPCGateway),
            VpcId: Fn.Ref(CallCollectorVPC),
        }),

        [ElasticIP]: new EC2.EIP({
            Domain: "vpc"
        }),

        [PrivateRouteTable]: new EC2.RouteTable({
            VpcId: Fn.Ref(CallCollectorVPC),
        }),

        [PublicRouteTable]: new EC2.RouteTable({
            VpcId: Fn.Ref(CallCollectorVPC),
        }),

        PublicRoute: new EC2.Route({
            RouteTableId: Fn.Ref(PublicRouteTable),
            DestinationCidrBlock: "0.0.0.0/0",
            GatewayId: Fn.Ref(CallCollectorVPCGateway)
        }),

        [MySqlDBSubnetGroup]: new RDS.DBSubnetGroup({
            DBSubnetGroupDescription: "Default Subnet Group",
            SubnetIds: [Fn.Ref(CallCollectorVPCSubnet), Fn.Ref(CallCollectorVPCSubnet2)]
        }),

        [MySqlDBInstance]: new RDS.DBInstance ({
            DBParameterGroupName: Fn.Ref(MySqlDBInstanceParameters),
            Engine: "mysql",
            EngineVersion: "5.7",
            // DBClusterIdentifier: Fn.Ref(MySqlDBCluster),
            PubliclyAccessible: true,
            VPCSecurityGroups: [Fn.Ref(CallCollectorVPCSecurityGroup)],
            DBInstanceClass: "db.t2.medium",
            DBSubnetGroupName: Fn.Ref(MySqlDBSubnetGroup),
            StorageType: 'gp2',
            AllocatedStorage: "1024",
            MasterUsername: "root",
            MasterUserPassword: Fn.Ref(DBPASSWORD),
            DBName: DBName,
        }).dependsOn(CallCollectorVPCGatewayAttachment),

        [MySqlDBInstanceParameters]: new RDS.DBParameterGroup({
            Description: "Default MySql Instance Parameter Group",
            Family: "mysql5.7",
            Parameters: {
                "sql_mode": "IGNORE_SPACE",
                "max_connections": "1200"
            }
        }),

        // API Gateway
        [InboundCallAPI]: new ApiGateway.RestApi ({
            Name: Fn.Join('', [Refs.StackName, InboundCallAPIName])
        }),

        InboundCallAPIDomain: new ApiGateway.DomainName ({
            DomainName: Fn.Ref('ApiDomainName'),
            CertificateArn: Fn.Ref('ApiCertificateArn'),
        }),

        [InboundCallAPIDeploy]: new ApiGateway.Deployment({
          RestApiId: Fn.Ref(InboundCallAPI),
          StageName: 'Prototype'
        }).dependsOn(SampleResourceOptionsMethod),

        [InboundCallApiStage]: new ApiGateway.Stage({
            DeploymentId: Fn.Ref(InboundCallAPIDeploy),
            RestApiId: Fn.Ref(InboundCallAPI),
            StageName: 'LATEST'
        }),

        InboundCallAPIBasePathMapping: new ApiGateway.BasePathMapping ({
            DomainName: Fn.Ref('ApiDomainName'),
            RestApiId: Fn.Ref(InboundCallAPI),
            Stage: 'LATEST'
        }).dependsOn(InboundCallApiStage),

        [SampleResource]: new ApiGateway.Resource({
          RestApiId: Fn.Ref(InboundCallAPI),
          ParentId: Fn.GetAtt(InboundCallAPI, 'RootResourceId'),
          PathPart: 'sample'
        }),
        [SampleResourceOptionsMethod]: new ApiGateway.Method({
          ResourceId: Fn.Ref(SampleResource),
          RestApiId: Fn.Ref(InboundCallAPI),
          AuthorizationType: 'NONE',
          HttpMethod: 'OPTIONS',
          Integration: {
              Type: 'MOCK',
              IntegrationHttpMethod: 'POST',
              PassthroughBehavior: "WHEN_NO_TEMPLATES",
              RequestTemplates: {
                  'application/json': '{"statusCode": 200}'
              },
              IntegrationResponses: [
                  {
                      StatusCode: "200",
                      ResponseParameters: {
                          "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                          "method.response.header.Access-Control-Allow-Methods": "'GET,POST,OPTIONS'",
                          "method.response.header.Access-Control-Allow-Origin": "'*'"
                      },
                      ResponseTemplates: {
                          'application/json': '200'
                      },
                  }
              ]
          },
          MethodResponses: [{
              StatusCode: "200",
              ResponseModels: {
                  "application/json": "Empty"
              },
              ResponseParameters: {
                  "method.response.header.Access-Control-Allow-Headers": true,
                  "method.response.header.Access-Control-Allow-Methods": true,
                  "method.response.header.Access-Control-Allow-Origin": true
              }
          }],
        }),



        // CodePipeline
        CodePipeline: new CodePipeline.Pipeline({
            // Name: "call_api_codepipeline",
            ArtifactStore: {
                Location: Fn.Join('-', ['dp', Refs.StackName, 'artifacts']),
                Type: "S3"
            },
            RoleArn: Fn.GetAtt(CodePipelineRole, 'Arn'),
            Stages: [
                {
                    Name: "Source",
                    Actions: [
                        {
                            Name: "Source",
                            ActionTypeId: {
                                Category: "Source",   // Source | Build | Deploy | Test | Invoke | Approval
                                Owner: "AWS",         // AWS | ThirdParty | Custom
                                Version: "1",
                                Provider: "CodeCommit"
                            },
                            OutputArtifacts: [
                                {
                                    Name: "SourceOutput"
                                }
                            ],
                            Configuration: {
                                PollForSourceChanges: true,
                                RepositoryName: 'dp-collector-api',
                                BranchName: Fn.Ref('CodeCommitBranch')
                            }
                        }
                    ]
                },
                {
                    Name: "Deploy",
                    Actions: [
                        {
                            Name: "Build",
                            ActionTypeId: {
                                Category: "Build",   // Source | Build | Deploy | Test | Invoke | Approval
                                Owner: "AWS",         // AWS | ThirdParty | Custom
                                Version: "1",
                                Provider: "CodeBuild"
                            },
                            InputArtifacts: [
                                {
                                    Name: "SourceOutput",
                                }
                            ],
                            Configuration: {
                                ProjectName: Fn.Ref(CodeBuildProject)
                            }
                        }
                    ]
                }
            ]
        }).dependsOn(CodeBuildArtifactBucket),
        [CodePipelineRole]: new IAM.Role({
            AssumeRolePolicyDocument: {
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: [
                        "codepipeline.amazonaws.com",
                        "codecommit.amazonaws.com",
                        "s3.amazonaws.com",
                        "codebuild.amazonaws.com"
                    ] },
                    Action: ["sts:AssumeRole"]
                }]
            },
            Path: "/",
            ManagedPolicyArns: [
                "arn:aws:iam::aws:policy/AWSCodePipelineFullAccess",
                "arn:aws:iam::aws:policy/AWSCodeCommitFullAccess",
                "arn:aws:iam::aws:policy/AmazonS3FullAccess",
                "arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess",
                "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
                "arn:aws:iam::aws:policy/AWSLambdaFullAccess",
                "arn:aws:iam::aws:policy/AmazonEC2FullAccess" // TODO: Too much
            ],
            Policies: [
                {
                    PolicyName: "ssm",
                    PolicyDocument: {
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Effect: "Allow",
                                "Action": [
                                    "ssm:getParameter",
                                    "ssm:getParameters"
                                ],
                                "Resource": [
                                    Fn.Join(':', [
                                        'arn',
                                        'aws',
                                        'ssm',
                                        Refs.Region,
                                        Refs.AccountId,
                                        'parameter/*'
                                    ])
                                ]
                            }
                        ]
                    }
                }
            ],
        }),


        // Codebuild
        [CodeBuildProject]: new CodeBuild.Project({
            Artifacts: {
                Type: "CODEPIPELINE"
            },
            Description: "Zip up Lambda API for Deployment",
            Environment: {
                ComputeType: 'BUILD_GENERAL1_SMALL',
                Image: 'aws/codebuild/nodejs:8.11.0',
                Type: 'LINUX_CONTAINER',
                EnvironmentVariables: [
                    {
                        Name: "DEPLOYMENT_BUCKET",
                        Type: "PLAINTEXT",
                        Value: Fn.Join('-', ['dp', Refs.StackName, 'artifacts'])
                    },
                    {
                        Name: "LAMBDA_FUNCTION_NAME",
                        Type: "PLAINTEXT",
                        Value: Fn.GetAtt(ConsumerLambda, 'Arn')
                    },
                    {
                        Name: 'NODE_ENV',
                        Type: "PLAINTEXT",
                        Value: 'production'
                    },
                    {
                        Name: 'DB_HOST',
                        Type: "PLAINTEXT",
                        Value: Fn.GetAtt(MySqlDBInstance, "Endpoint.Address")
                    },
                    {
                        Name: 'DB_PORT',
                        Type: "PLAINTEXT",
                        Value: Fn.GetAtt(MySqlDBInstance, "Endpoint.Port")
                    },
                    {
                        Name: 'DB_USERNAME',
                        Type: "PLAINTEXT",
                        Value: 'root'
                    },
                    {
                        Name: 'DB_PASS_PARAM',
                        Type: "PLAINTEXT",
                        Value: Fn.Ref(DBPASSWORD)
                    },
                    {
                        Name: 'DB_NAME',
                        Type: "PLAINTEXT",
                        Value: DBName
                    }
                ]
            },
            ServiceRole: Fn.GetAtt(CodePipelineRole, 'Arn'),
            Source: {
                Type: 'CODEPIPELINE'
            },
        })
    }
});