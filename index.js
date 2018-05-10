'use strict';

// config.json contain all the required information for code running
const config = require('./config.json');

const PROJECT_ID = process.env.GCLOUD_PROJECT;
const IncomingWebhook = require('@slack/client').IncomingWebhook;
const webhook = new IncomingWebhook(config.SLACK_WEBHOOK);

const container = require('@google-cloud/container');
const k8s = require('kubernetes-client');


// deployStudio is the main function called by Cloud Functions.
exports.deployStudio = (event, callback) => {
  const build = eventToBuild(event.data.data);

  const status = ['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT'];
  if (status.indexOf(build.status) === -1) {
    return callback();
  }

  // Send message to Slack.
  console.log("Sending build status to slack...");
  const message = createBuildMessage(build);
  webhook.send(message, callback);


  if (build.status == 'SUCCESS') {
    const cluster = new container.v1.ClusterManagerClient({
      projectId: PROJECT_ID,
    });

    const clusterInfo = {
      projectId: PROJECT_ID,
      zone: 'us-central1-f',
      clusterId: 'studio-dev-preview',
    };

    cluster.getCluster(clusterInfo)
      .then(responses => {
        const response = responses[0];

        const client = new k8s.Extensions({
          url: 'https://' + response['endpoint'],
          version: 'v1beta1',
          namespace: 'cloudfunction',
          insecureSkipTlsVerify: true,
          auth:{
            user: response['masterAuth']['username'],
            pass: response['masterAuth']['password']
          },
        });

        const patch = { spec: { template: { spec: { containers: [ {
          name: 'app',
          image: build.images[1]
        } ] } } } };

        client.namespaces('cloudfunction').deployments('studio-app').patch({
          body: patch,
        }, function(error, result){
          if (error == null) {
            const deployStatus = 'SUCCESS';
            var deployMsg = createDeployMessage(deployStatus);
            console.log('Success:', result);
          }
          else{
            const deployStatus = 'FAILURE';
            var deployMsg = createDeployMessage(deployStatus);
            console.log('Error:', error);
          }
          console.log("Sending deployment status to slack...");
          webhook.send(deployMsg, callback);
        });

      })
      .catch(err => {
        console.error('ERROR:', err);
      });
  }

  
};

// eventToBuild transforms pubsub event message to a build object.
const eventToBuild = (data) => {
  return JSON.parse(new Buffer(data, 'base64').toString());
}

// createSlackMessage create a message from a build object.
const createBuildMessage = (build) => {
  let message = {
    text: `Build \`${build.id}\``,
    mrkdwn: true,
    attachments: [
      {
        title: 'Build logs',
        title_link: build.logUrl,
        fields: [
        {
          title: 'Status',
          value: build.status,
        }
        // {
        //   title: 'Project ID',
        //   value: build.projectId
        // },
        // {
        //   title: 'Repository',
        //   value: build.sourceProvenance['resolvedRepoSource']['repoName'],
        // },
        // {
        //   title: 'branch',
        //   value: build.source['repoSource']['branchName'],
        // },
        // {
        //   title: 'Commit',
        //   value: build.sourceProvenance['resolvedRepoSource']['commitSha'],
        // }
        ]
      }
    ]
  };
  return message
}


// createSlackMessage create a message from a deployment status.
const createDeployMessage = (deploy) => {
  let message = {
    text: `Deployment`,
    mrkdwn: true,
    color:"#D00000",
    attachments: [
      {
        title: 'Deployment Result',
        fields: [
        {
          title: 'Status',
          value: deploy
        },
        {
          title: 'Notes',
          value: 'Please run `kubectl get pods` to double check if the deployment is successful.'
        }]
      }
    ]
  };
  return message
}
