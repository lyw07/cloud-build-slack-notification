import os
import ast
import base64
import requests


def create_build_message(build):
    field = [
        {
            "title": "Status",
            "value": build["status"],
        },
        {
            "title": "Branch",
            "value": build["source"]['repoSource']['branchName'],
        },
        {
            "title": "Commit",
            "value": build["sourceProvenance"]['resolvedRepoSource']['commitSha'],
        }
    ]

    if build["status"] == "SUCCESS":
        instanceLink = {
            "title": "Link to instance",
            "value": "{}.studio.cd.learningequality.org".format(build["source"]['repoSource']['branchName'])
        }
        field.append(instanceLink)
    
    message = {
        "text": "Build {}".format(build["id"]),
        "attachments": [
            {
                "title": "Build logs",
                "title_link": build["logUrl"],
                "fields": field
            }
        ]
    }
    
    return message

def cloud_build_slack_notification(event, context):
    pubsub_message = ast.literal_eval(base64.b64decode(event["data"]).decode("utf-8"))

    status = ["SUCCESS", "FAILURE", "INTERNAL_ERROR", "TIMEOUT"]

    if pubsub_message["status"] not in status:
        return

    print ("Sending build status to slack...")

    slack_message = create_build_message(pubsub_message)

    slack_webhook = os.environ["SLACK_INCOMING_WEBHOOK"]

    response = requests.post(slack_webhook, json=slack_message, headers={"Content-Type": "application/json"})

    print ("Status of posting message is {}, {}".format(response.status_code, response.content))
