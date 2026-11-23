import type { LogSourceType } from '../types';

const ESC = '\u001b';
const join = (lines: string[]) => lines.join('\n');

/* -------------------------------- GitLab CI -------------------------------- */
const gl = (kind: 'start' | 'end', ts: number, name: string, title = '') =>
  kind === 'start'
    ? `section_start:${ts}:${name}\r${ESC}[0K${ESC}[36;1m${title}${ESC}[0;m`
    : `section_end:${ts}:${name}\r${ESC}[0K`;

export const gitlabLog = join([
  `Running with gitlab-runner 17.5.0 (b92ee590)`,
  `  on shared-runner-01 xYz12345, system ID: s_4f1a2b3c4d5e`,
  gl('start', 1763805600, 'prepare_executor', 'Preparing the "docker" executor'),
  `Using Docker executor with image node:20-alpine ...`,
  `Pulling docker image node:20-alpine ...`,
  `Using docker image sha256:9a1f2c3d4e5f for node:20-alpine with digest node@sha256:7c3b... ...`,
  gl('end', 1763805604, 'prepare_executor'),
  gl('start', 1763805604, 'get_sources', 'Getting source from Git repository'),
  `Fetching changes with git depth set to 20...`,
  `Initialized empty Git repository in /builds/acme/webapp/.git/`,
  `Checking out 4f2a9c1e as detached HEAD (ref is main)...`,
  gl('end', 1763805607, 'get_sources'),
  gl('start', 1763805607, 'step_script', 'Executing "step_script" stage of the job script'),
  `$ npm ci --prefer-offline`,
  `npm warn deprecated inflight@1.0.6: This module is not supported`,
  `added 1243 packages in 21s`,
  `$ npm run build`,
  `> webapp@2.4.0 build`,
  `> vite build`,
  `${ESC}[32mvite v5.4.2 building for production...${ESC}[0m`,
  `${ESC}[32m\u2713${ESC}[0m 412 modules transformed.`,
  `dist/assets/index-3f9a1c.js   184.20 kB \u2502 gzip: 59.41 kB`,
  `${ESC}[32m\u2713 built in 8.12s${ESC}[0m`,
  gl('end', 1763805645, 'step_script'),
  gl('start', 1763805645, 'deploy_staging', 'Deploying to staging'),
  `$ kubectl set image deployment/webapp webapp=registry.acme.io/webapp:4f2a9c1e --namespace staging`,
  `deployment.apps/webapp image updated`,
  `$ kubectl rollout status deployment/webapp --namespace staging --timeout=120s`,
  `Waiting for deployment "webapp" rollout to finish: 1 out of 3 new replicas have been updated...`,
  `error: deployment "webapp" exceeded its progress deadline`,
  gl('end', 1763805770, 'deploy_staging'),
  `${ESC}[31;1mERROR: Job failed: exit code 1${ESC}[0;m`,
]);

/* ------------------------------ GitHub Actions ----------------------------- */
const ts = (s: string) => `2026-11-22T10:${s}Z`;
export const githubLog = join([
  `${ts('00:01.1234567')} ##[group]Run actions/checkout@v4`,
  `${ts('00:01.1240000')} with:`,
  `${ts('00:01.1240001')}   repository: acme/webapp`,
  `${ts('00:01.1240002')}   fetch-depth: 1`,
  `${ts('00:01.1250000')} ##[endgroup]`,
  `${ts('00:02.0000000')} Syncing repository: acme/webapp`,
  `${ts('00:03.4000000')} Checking out the ref`,
  `${ts('00:04.0000000')} ##[group]Run actions/setup-node@v4`,
  `${ts('00:04.0010000')} with:`,
  `${ts('00:04.0010001')}   node-version: 20`,
  `${ts('00:04.0020000')} ##[endgroup]`,
  `${ts('00:06.5000000')} Found in cache @ /opt/hostedtoolcache/node/20.18.0/x64`,
  `${ts('00:07.0000000')} ##[group]Run npm ci`,
  `${ts('00:07.0010000')} ##[endgroup]`,
  `${ts('00:28.0000000')} added 1243 packages, and audited 1244 packages in 21s`,
  `${ts('00:28.1000000')} ##[group]Run npm test -- --coverage`,
  `${ts('00:28.1010000')} ##[endgroup]`,
  `${ts('00:35.0000000')} PASS  src/utils/date.test.ts`,
  `${ts('00:35.2000000')} ::warning file=src/utils/date.ts,line=42,col=7::Deprecated API usage: moment() will be removed in v4`,
  `${ts('00:41.0000000')} FAIL  tests/api.test.ts`,
  `${ts('00:41.1000000')} ::error file=tests/api.test.ts,line=88,col=12::Expected status 200 but received 500`,
  `${ts('00:41.2000000')} Tests:       1 failed, 57 passed, 58 total`,
  `${ts('00:41.3000000')} ##[error]Process completed with exit code 1.`,
  `${ts('00:42.0000000')} ##[group]Post job cleanup.`,
  `${ts('00:42.0010000')} ##[endgroup]`,
  `${ts('00:42.5000000')} Cleaning up orphan processes`,
]);

/* ----------------------------- AWS CodeBuild ------------------------------- */
const cb = (t: string, msg: string) => `[Container] 2026/11/22 ${t} ${msg}`;
export const awsLog = join([
  cb('10:00:00.101010', 'Waiting for agent ping'),
  cb('10:00:02.202020', 'Phase is DOWNLOAD_SOURCE'),
  cb('10:00:04.303030', 'CODEBUILD_SRC_DIR=/codebuild/output/src123/src/github.com/acme/webapp'),
  cb('10:00:05.404040', 'Phase complete: DOWNLOAD_SOURCE State: SUCCEEDED'),
  cb('10:00:05.505050', 'Phase context status code:  Message: '),
  cb('10:00:05.606060', 'Entering phase INSTALL'),
  cb('10:00:05.707070', 'Running command npm ci --prefer-offline'),
  cb('10:00:25.808080', 'added 1243 packages in 20s'),
  cb('10:00:26.000000', 'Phase complete: INSTALL State: SUCCEEDED'),
  cb('10:00:26.100000', 'Entering phase PRE_BUILD'),
  cb('10:00:26.200000', 'Running command aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-south-1.amazonaws.com'),
  cb('10:00:28.300000', 'Login Succeeded'),
  cb('10:00:28.400000', 'Phase complete: PRE_BUILD State: SUCCEEDED'),
  cb('10:00:28.500000', 'Entering phase BUILD'),
  cb('10:00:28.600000', 'Running command docker build -t 123456789012.dkr.ecr.ap-south-1.amazonaws.com/webapp:1.4.2 .'),
  cb('10:01:10.700000', 'Successfully built 5d1c9a8b7e6f'),
  cb('10:01:10.800000', 'Running command docker push 123456789012.dkr.ecr.ap-south-1.amazonaws.com/webapp:1.4.2'),
  cb('10:01:14.900000', 'denied: User is not authorized to perform: ecr:InitiateLayerUpload on resource: arn:aws:ecr:ap-south-1:123456789012:repository/webapp'),
  cb('10:01:15.000000', 'Command did not exit successfully docker push 123456789012.dkr.ecr.ap-south-1.amazonaws.com/webapp:1.4.2 exit status 1'),
  cb('10:01:15.100000', 'Phase complete: BUILD State: FAILED'),
  cb('10:01:15.200000', 'Phase context status code: COMMAND_EXECUTION_ERROR Message: Error while executing command: docker push. Reason: exit status 1'),
  cb('10:01:15.300000', 'Entering phase POST_BUILD'),
  cb('10:01:15.400000', 'Phase complete: POST_BUILD State: SUCCEEDED'),
]);

/** CloudWatch Logs events - pass directly as `rawLogs={mockCloudWatchEvents}`. */
export const mockCloudWatchEvents: object[] = [
  { timestamp: 1763805600000, logStreamName: 'ecs/webapp/3f9a1c2d4e5f', logGroupName: '/ecs/webapp', message: 'Server listening on :8080' },
  { timestamp: 1763805601500, logStreamName: 'ecs/webapp/3f9a1c2d4e5f', logGroupName: '/ecs/webapp', message: '{"level":"info","msg":"Connected to RDS","host":"webapp.cluster-abc.ap-south-1.rds.amazonaws.com"}' },
  { timestamp: 1763805604000, logStreamName: 'ecs/webapp/3f9a1c2d4e5f', logGroupName: '/ecs/webapp', message: 'WARN slow request GET /api/orders took 2310ms' },
  { timestamp: 1763805605000, logStreamName: 'ecs/worker/8b7c6d5e4f3a', logGroupName: '/ecs/webapp', message: 'ERROR queue consumer failed: ThrottlingException: Rate exceeded' },
];

/* ------------------------------ Azure DevOps ------------------------------- */
const az = (s: string, msg: string) => `2026-11-22T10:${s}Z ${msg}`;
export const azureLog = join([
  az('00:00.1000000', '##[section]Starting: Initialize job'),
  az('00:00.2000000', "Agent name: 'Azure Pipelines 4'"),
  az('00:00.3000000', 'Agent machine name: fv-az123-456'),
  az('00:01.0000000', '##[section]Finishing: Initialize job'),
  az('00:01.1000000', '##[section]Starting: Checkout acme/webapp@main to s'),
  az('00:03.0000000', 'Checking out the ref'),
  az('00:04.0000000', '##[section]Finishing: Checkout acme/webapp@main to s'),
  az('00:04.1000000', '##[section]Starting: Docker build and push'),
  az('00:04.2000000', '=============================================================================='),
  az('00:04.2100000', 'Task         : Docker'),
  az('00:04.2200000', 'Description  : Build or push Docker images, login or logout, start or stop containers'),
  az('00:04.2300000', 'Version      : 2.246.0'),
  az('00:04.2400000', 'Author       : Microsoft Corporation'),
  az('00:04.2500000', '=============================================================================='),
  az('00:05.0000000', '##[command]/usr/bin/docker build -f /home/vsts/work/1/s/Dockerfile --build-arg NODE_ENV=production -t acracme.azurecr.io/webapp:20261122.4 /home/vsts/work/1/s'),
  az('00:50.0000000', 'Successfully built 7a8b9c0d1e2f'),
  az('00:50.5000000', '##[command]/usr/bin/docker push acracme.azurecr.io/webapp:20261122.4'),
  az('01:05.0000000', '##[section]Finishing: Docker build and push'),
  az('01:05.1000000', '##[section]Starting: Deploy to AKS'),
  az('01:05.5000000', '##[command]/usr/local/bin/kubectl apply -f manifests/ --namespace prod'),
  az('01:07.0000000', 'deployment.apps/webapp configured'),
  az('01:07.1000000', 'service/webapp unchanged'),
  az('01:08.0000000', '##[warning]Resource requests are not set on container "sidecar"'),
  az('01:09.0000000', '##[error]Error from server (Forbidden): ingresses.networking.k8s.io "webapp" is forbidden: User "build-sp" cannot patch resource'),
  az('01:09.5000000', "##[error]Bash exited with code '1'."),
  az('01:10.0000000', '##[section]Finishing: Deploy to AKS'),
]);

/* ------------------------------ Docker Buildx ------------------------------ */
export const dockerLog = join([
  '#0 building with "default" instance using docker driver',
  '',
  '#1 [internal] load build definition from Dockerfile',
  '#1 transferring dockerfile: 412B done',
  '#1 DONE 0.0s',
  '',
  '#2 [internal] load metadata for docker.io/library/node:20-alpine',
  '#2 DONE 1.1s',
  '',
  '#3 [internal] load .dockerignore',
  '#3 transferring context: 2B done',
  '#3 DONE 0.0s',
  '',
  '#4 [1/5] FROM docker.io/library/node:20-alpine@sha256:7c3b9a1d2e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
  '#4 CACHED',
  '',
  '#5 [2/5] WORKDIR /app',
  '#5 CACHED',
  '',
  '#6 [3/5] COPY package*.json ./',
  '#6 DONE 0.1s',
  '',
  '#7 [4/5] RUN npm install --omit=dev',
  '#7 0.512 npm warn deprecated inflight@1.0.6: This module is not supported',
  '#7 14.201 added 312 packages, and audited 313 packages in 14s',
  '#7 DONE 14.2s',
  '',
  '#8 [5/5] COPY . .',
  '#8 DONE 0.3s',
  '',
  '#9 exporting to image',
  '#9 exporting layers 0.4s done',
  '#9 writing image sha256:5d1c9a8b7e6f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b done',
  '#9 naming to docker.io/acme/webapp:1.4.2 done',
  '#9 DONE 0.5s',
]);

/* ------------------------------- Kubernetes -------------------------------- */
const pod = 'webapp-7d9f8c6b5-x2k4p';
export const kubernetesLog = join([
  'deployment.apps/webapp configured',
  'service/webapp unchanged',
  'Waiting for deployment "webapp" rollout to finish: 1 out of 3 new replicas have been updated...',
  'Waiting for deployment "webapp" rollout to finish: 2 of 3 updated replicas are available...',
  'deployment "webapp" successfully rolled out',
  `[pod/${pod}/app] 2026-11-22T10:01:02.123Z {"level":"info","msg":"Server listening","port":8080,"env":"production"}`,
  `[pod/${pod}/app] {"level":"warn","msg":"Slow query detected","duration_ms":1820,"query":"SELECT * FROM orders WHERE status = 'open'"}`,
  `[pod/${pod}/istio-proxy] [2026-11-22T10:01:03.000Z] "GET /healthz HTTP/1.1" 200 - via_upstream - "-" 0 2 1 0`,
  `[pod/${pod}/app] {"level":"error","msg":"Connection refused","host":"postgres.prod.svc.cluster.local","port":5432}`,
  `[pod/${pod}/app] time=2026-11-22T10:01:09Z level=fatal msg="could not start worker pool" workers=8 reason=db_unreachable`,
  'Events:',
  '  Type     Reason     Age                From               Message',
  '  ----     ------     ----               ----               -------',
  `  Normal   Scheduled  2m                 default-scheduler  Successfully assigned prod/${pod} to node-3`,
  '  Normal   Pulling    2m                 kubelet            Pulling image "registry.acme.io/webapp:1.4.2"',
  '  Normal   Started    110s               kubelet            Started container app',
  '  Warning  Unhealthy  90s (x3 over 110s) kubelet            Readiness probe failed: HTTP probe failed with statuscode: 503',
  `  Warning  BackOff    45s                kubelet            Back-off restarting failed container app in pod ${pod}`,
]);

/* ---------------------------------- Helm ----------------------------------- */
export const helmLog = join([
  'upgrade.go:142: [debug] preparing upgrade for webapp',
  'upgrade.go:150: [debug] performing update for webapp',
  'client.go:486: [debug] Starting delete for "webapp-db-migrate" Job',
  'wait.go:48: [debug] beginning wait for 1 resources with timeout of 5m0s',
  'Release "webapp" has been upgraded. Happy Helming!',
  'NAME: webapp',
  'LAST DEPLOYED: Sun Nov 22 10:05:12 2026',
  'NAMESPACE: prod',
  'STATUS: deployed',
  'REVISION: 14',
  'TEST SUITE: None',
  'HOOKS:',
  '---',
  '# Source: webapp/templates/hooks/db-migrate.yaml',
  'apiVersion: batch/v1',
  'kind: Job',
  'metadata:',
  '  name: webapp-db-migrate',
  '  annotations:',
  '    "helm.sh/hook": pre-upgrade',
  '    "helm.sh/hook-weight": "-5"',
  '    "helm.sh/hook-delete-policy": hook-succeeded',
  'MANIFEST:',
  '---',
  '# Source: webapp/templates/service.yaml',
  'apiVersion: v1',
  'kind: Service',
  'metadata:',
  '  name: webapp',
  'spec:',
  '  ports:',
  '    - port: 80',
  '      targetPort: 8080',
  'NOTES:',
  '1. Get the application URL by running these commands:',
  '  kubectl --namespace prod port-forward svc/webapp 8080:80',
]);

/* --------------------------------- Jenkins --------------------------------- */
export const jenkinsLog = join([
  'Started by user admin',
  'Running in Durability level: MAX_SURVIVABILITY',
  '[Pipeline] Start of Pipeline',
  '[Pipeline] node',
  'Running on build-agent-3 in /var/jenkins/workspace/webapp',
  '[Pipeline] {',
  '[Pipeline] stage',
  '[Pipeline] { (Checkout)',
  '[Pipeline] checkout',
  'Selected Git installation does not exist. Using Default',
  'Checking out Revision 4f2a9c1e (refs/remotes/origin/main)',
  '[Pipeline] }',
  '[Pipeline] // stage',
  '[Pipeline] stage',
  '[Pipeline] { (Build)',
  '[Pipeline] sh',
  '+ npm ci',
  'added 1243 packages in 19s',
  '[Pipeline] sh',
  '+ npm run build',
  '> vite build',
  'built in 8.04s',
  '[Pipeline] }',
  '[Pipeline] // stage',
  '[Pipeline] stage',
  '[Pipeline] { (Integration Tests)',
  'Stage "Integration Tests" skipped due to when conditional',
  '[Pipeline] }',
  '[Pipeline] // stage',
  '[Pipeline] stage',
  '[Pipeline] { (Deploy)',
  '[Pipeline] sh',
  '+ helm upgrade --install webapp ./chart --namespace prod --set image.tag=1.4.2 --atomic',
  'Error: UPGRADE FAILED: timed out waiting for the condition',
  'ERROR: script returned exit code 1',
  '[Pipeline] }',
  '[Pipeline] // stage',
  '[Pipeline] End of Pipeline',
  'Finished: FAILURE',
]);


/* ------------------------------ GCP Cloud Build ---------------------------- */
export const gcpLog = join([
  'starting build "3f9a1c2d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"',
  '',
  'FETCHSOURCE',
  'Fetching storage object: gs://acme-prod_cloudbuild/source/1763805600.tgz#1763805601234',
  'Copying gs://acme-prod_cloudbuild/source/1763805600.tgz#1763805601234...',
  'Operation completed over 1 objects/12.4 MiB.',
  'BUILD',
  'Starting Step #0 - "build"',
  'Step #0 - "build": Already have image (with digest): gcr.io/cloud-builders/docker',
  'Step #0 - "build": Sending build context to Docker daemon  12.4MB',
  'Step #0 - "build": Step 1/5 : FROM node:20-alpine',
  'Step #0 - "build": Successfully tagged gcr.io/acme-prod/webapp:1.4.2',
  'Finished Step #0 - "build"',
  'Starting Step #1 - "push"',
  'Step #1 - "push": The push refers to repository [gcr.io/acme-prod/webapp]',
  'Step #1 - "push": 1.4.2: digest: sha256:5d1c9a8b7e6f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b size: 1578',
  'Finished Step #1 - "push"',
  'Starting Step #2 - "deploy"',
  'Step #2 - "deploy": Already have image (with digest): gcr.io/google.com/cloudsdktool/cloud-sdk',
  "Step #2 - \"deploy\": ERROR: (gcloud.run.deploy) PERMISSION_DENIED: Permission 'run.services.update' denied on resource 'projects/acme-prod/locations/asia-south1/services/webapp'",
  'Finished Step #2 - "deploy"',
  'ERROR',
  'ERROR: build step 2 "gcr.io/google.com/cloudsdktool/cloud-sdk" failed: step exited with non-zero status: 1',
]);

/* -------------------------------- Buildkite -------------------------------- */
export const buildkiteLog = join([
  '~~~ Running global environment hook',
  '$ /etc/buildkite-agent/hooks/environment',
  '~~~ Preparing working directory',
  '$ cd /var/lib/buildkite-agent/builds/agent-1/acme/webapp',
  '$ git clone -v -- git@github.com:acme/webapp.git .',
  "Cloning into '.'...",
  '$ git checkout -f 4f2a9c1e',
  '--- :docker: Build image',
  '$ docker build --tag registry.acme.io/webapp:1.4.2 --file Dockerfile .',
  'Successfully built 5d1c9a8b7e6f',
  '+++ :jest: Run tests',
  '$ npm test -- --coverage',
  'PASS  src/utils/date.test.ts',
  'FAIL  tests/api.test.ts',
  'Tests:       1 failed, 57 passed, 58 total',
  '\u{1F6A8} Error: The command exited with status 1',
  '^^^ +++',
  'user command error: The plugin docker command hook exited with status 1',
]);

/* -------------------------------- TeamCity --------------------------------- */
export const teamcityLog = join([
  "[10:00:01]Build 'Webapp :: Build' #482 started",
  "##teamcity[blockOpened name='Compile' description='Compiling sources']",
  '[10:00:03] : [Compile] > Task :compileJava',
  "##teamcity[message text='Using Java 17' status='NORMAL']",
  "##teamcity[message text='Deprecated API used in Foo.java' status='WARNING']",
  "##teamcity[blockClosed name='Compile']",
  "##teamcity[blockOpened name='Tests' description='Running unit tests']",
  "##teamcity[testStarted name='OrderServiceTest.createsOrder']",
  "##teamcity[testFinished name='OrderServiceTest.createsOrder' duration='132']",
  "##teamcity[testStarted name='PaymentTest.rejectsExpiredCard']",
  "##teamcity[testFailed name='PaymentTest.rejectsExpiredCard' message='expected:<DECLINED> but was:<APPROVED>' details='at PaymentTest.java:57']",
  "##teamcity[testFinished name='PaymentTest.rejectsExpiredCard' duration='88']",
  "##teamcity[blockClosed name='Tests']",
  "##teamcity[buildProblem description='Tests failed: 1 (1 new), passed: 241' identity='abc123']",
  "##teamcity[buildStatus status='FAILURE' text='Tests failed: 1']",
]);

/* ---------------------------- Terraform / OpenTofu ------------------------- */
export const terraformLog = join([
  'Initializing the backend...',
  'Initializing provider plugins...',
  '- Finding hashicorp/aws versions matching "~> 5.0"...',
  '- Installing hashicorp/aws v5.72.1...',
  'Terraform has been successfully initialized!',
  'aws_vpc.main: Refreshing state... [id=vpc-0a1b2c3d]',
  '',
  'Terraform used the selected providers to generate the following execution plan.',
  'Terraform will perform the following actions:',
  '',
  '  # aws_instance.web will be created',
  '  + resource "aws_instance" "web" {',
  '      + ami           = "ami-0abcdef1234567890"',
  '      + instance_type = "t3.micro"',
  '    }',
  '',
  '  # aws_s3_bucket.logs will be updated in-place',
  '  ~ resource "aws_s3_bucket" "logs" {',
  '    }',
  '',
  'Plan: 1 to add, 1 to change, 0 to destroy.',
  'aws_s3_bucket.logs: Modifying... [id=acme-logs]',
  'aws_s3_bucket.logs: Modifications complete after 2s [id=acme-logs]',
  'aws_instance.web: Creating...',
  'aws_instance.web: Still creating... [10s elapsed]',
  'aws_instance.web: Still creating... [20s elapsed]',
  '\u2577',
  '\u2502 Error: creating EC2 Instance: InsufficientInstanceCapacity: We currently do not have sufficient t3.micro capacity',
  '\u2502',
  '\u2502   with aws_instance.web,',
  '\u2502   on main.tf line 12, in resource "aws_instance" "web":',
  '\u2575',
]);

/* ---------------------------------- Ansible -------------------------------- */
export const ansibleLog = join([
  'PLAY [Configure web servers] ***************************************************',
  '',
  'TASK [Gathering Facts] *********************************************************',
  'ok: [web1]',
  'ok: [web2]',
  '',
  'TASK [nginx : Install nginx] ***************************************************',
  'changed: [web1]',
  'ok: [web2]',
  '',
  'TASK [nginx : Deploy config] ***************************************************',
  'changed: [web1] => {"changed": true, "dest": "/etc/nginx/nginx.conf", "mode": "0644"}',
  'fatal: [web2]: FAILED! => {"changed": false, "msg": "Destination directory /etc/nginx does not exist", "rc": 1}',
  '',
  'TASK [nginx : Restart nginx] ***************************************************',
  'skipping: [web1]',
  '',
  'PLAY RECAP *********************************************************************',
  'web1                       : ok=3    changed=2    unreachable=0    failed=0    skipped=1',
  'web2                       : ok=2    changed=0    unreachable=0    failed=1    skipped=0',
]);

/* ------------------------------ Docker Compose ----------------------------- */
export const composeLog = join([
  '[+] Running 3/3',
  ' \u2714 Network app_default  Created',
  ' \u2714 Container app-db-1   Started',
  ' \u2714 Container app-web-1  Started',
  'Attaching to db-1, web-1',
  'db-1   | 2026-11-22 10:00:01.123 UTC [1] LOG:  database system is ready to accept connections',
  'web-1  | > webapp@2.4.0 start',
  'web-1  | Server listening on :8080',
  'web-1  | Error: connect ECONNREFUSED 127.0.0.1:5432',
  'web-1 exited with code 1',
]);

/* ---------------------------------- NDJSON --------------------------------- */
export const jsonLog = join([
  '{"timestamp":"2026-11-22T10:00:00.120Z","level":"info","stage":"validate","msg":"Starting deployment","input":{"version":"1.4.2","region":"ap-south-1"}}',
  '{"timestamp":"2026-11-22T10:00:01.050Z","level":"debug","stage":"validate","msg":"Manifest schema ok","input":{"files":14}}',
  '{"timestamp":"2026-11-22T10:00:02.400Z","level":"info","stage":"provision","msg":"Creating load balancer","input":{"type":"application","scheme":"internet-facing"}}',
  '{"timestamp":"2026-11-22T10:00:09.900Z","level":"warn","stage":"provision","msg":"Security group allows 0.0.0.0/0 on port 22","sg":"sg-0a1b2c3d"}',
  '{"timestamp":"2026-11-22T10:00:12.000Z","level":"info","stage":"migrate","msg":"Running migrations","input":{"direction":"up","count":3}}',
  '{"timestamp":"2026-11-22T10:00:14.310Z","level":"error","stage":"migrate","msg":"Migration 0042_add_index failed","error":"relation \\"orders_status_idx\\" already exists","exit_code":1}',
  '{"timestamp":"2026-11-22T10:00:14.900Z","level":"fatal","stage":"release","msg":"Aborting release","reason":"migration_failed"}',
]);

/* ----------------------------- Registry & helpers --------------------------- */
export type MockLogKey = Exclude<LogSourceType, 'auto' | 'plaintext'>;

export const mockLogs: Record<MockLogKey, string> = {
  gitlab: gitlabLog,
  github: githubLog,
  aws: awsLog,
  azure: azureLog,
  docker: dockerLog,
  kubernetes: kubernetesLog,
  helm: helmLog,
  jenkins: jenkinsLog,
  gcp: gcpLog,
  buildkite: buildkiteLog,
  teamcity: teamcityLog,
  terraform: terraformLog,
  ansible: ansibleLog,
  compose: composeLog,
  json: jsonLog,
};

export const mockLogLabels: Record<MockLogKey, string> = {
  gitlab: 'GitLab CI',
  github: 'GitHub Actions',
  aws: 'AWS CodeBuild',
  azure: 'Azure DevOps',
  docker: 'Docker Buildx',
  kubernetes: 'Kubernetes',
  helm: 'Helm',
  jenkins: 'Jenkins',
  gcp: 'GCP Cloud Build',
  buildkite: 'Buildkite',
  teamcity: 'TeamCity',
  terraform: 'Terraform',
  ansible: 'Ansible',
  compose: 'Docker Compose',
  json: 'NDJSON',
};

/** Generates a large GitHub-Actions-style log - handy for testing virtualization with 10k+ lines. */
export function generateLargeMockLog(lineCount = 10000, linesPerStage = 250): string {
  const out: string[] = [];
  let i = 0;
  let stage = 0;
  while (out.length < lineCount) {
    const secs = String(Math.floor(i / 20) % 60).padStart(2, '0');
    const stamp = `2026-11-22T10:${String(Math.floor(i / 1200) % 60).padStart(2, '0')}:${secs}.000Z`;
    if (i % linesPerStage === 0) {
      out.push(`${stamp} ##[group]Run build-step-${stage++}`);
      out.push(`${stamp} ##[endgroup]`);
    }
    const r = i % 97;
    if (r === 0) out.push(`${stamp} ::warning file=src/module-${i}.ts,line=${(i % 400) + 1}::Unused variable detected`);
    else if (r === 1 && i % 500 === 1) out.push(`${stamp} ##[error]Compilation failed in module-${i} with exit code 2`);
    else out.push(`${stamp} Compiling module-${i} (${(i * 7) % 1000} ms)`);
    i++;
  }
  return out.slice(0, lineCount).join('\n');
}
