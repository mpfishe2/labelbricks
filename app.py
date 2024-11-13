from flask import Flask, request, jsonify, render_template, session
import os
import base64
from PIL import Image
from io import BytesIO
from databricks.sdk import WorkspaceClient
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
import uuid
from libraries.volumes import VolumeClient
import logging

load_dotenv()


global vc

# Initialize the Databricks Workspace Client
if ".env" in os.listdir(os.curdir):
    # this is for local development
    w = WorkspaceClient(host=os.getenv("FULL_DATABRICKS_HOST"), token=os.getenv("DATABRICKS_TOKEN_VALUE"))
    SAVE_IMG_FOLDER = 'static/saved_images'
    os.makedirs(SAVE_IMG_FOLDER, exist_ok=True)
    TEMP_IMAGE_DIR = 'static/temp_images'
    os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)
    SAVE_TXT_FOLDER = 'static/saved_text'

    vc = VolumeClient(w, os.getenv("VOLUME_URI"))
else:
    # this will be engaged when the app is running in Databricks
    logging.info("Establish environment")
    w = WorkspaceClient()
    SAVE_IMG_FOLDER = 'static/saved_images'
    TEMP_IMAGE_DIR = 'static/temp_images'
    os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)
    SAVE_TXT_FOLDER = 'static/saved_text'
    vc = VolumeClient(w, os.getenv("VOLUME_URI"))
    logging.info("Finish establishing environment")

app = Flask(__name__)


def getUserInfo():
    user_name = request.headers.get('X-Forwarded-Preferred-Username', 'Not available')
    user_id = request.headers.get('X-Forwarded-User', 'Not available')
    user_email = request.headers.get('X-Forwarded-Email', 'Not available')
    return {
        "user_name": user_name,
        "user_id": user_id,
        "user_email": user_email
    }



@app.route('/')
def index():
    return render_template('set_volume.html')




@app.route('/render_image_annotator', methods=["POST"])
def render_image_annotator():
    catalog_name = request.form.get('catalog_name')
    schema_name = request.form.get('schema_name')
    volume_name = request.form.get('volume_name')
    img_dir_path = request.form.get('img_dir_path')
    volume_path = f"/Volumes/{catalog_name}/{schema_name}/{volume_name}"
    vc = VolumeClient(w, volume_path)
    files = vc.listFiles(img_dir_path, "paths")
    files = [file for file in files if file.lower().endswith(('.png', '.jpg', '.jpeg'))]
    return render_template('index.html', files=files, volumePath=volume_path)


@app.route('/fetch_image')
def fetch_image():
    # need to set a user specific directory for the file to be downloaded to
    # this way multiple users can use the Databricks App at a time
    if ".env" in os.listdir(os.curdir):
        # this is only for local testing, no need for this environment variable when deployed
        user_email = os.getenv("TEST_REVIEWER")
    else:
        # this derives the email from the request header
        user_email = request.headers.get('X-Forwarded-Email', f'UnknownUser{uuid.uuid4()}')
    temp_image_dir_user = TEMP_IMAGE_DIR+f"/{user_email}"
    os.makedirs(temp_image_dir_user, exist_ok=True)

    # download the file
    file_path = request.args.get('file_path')
    volume_path = "/".join(file_path.split("/")[0:-1])
    print(f'OOOOO= {file_path}')
    print(f"volume path = {volume_path}")
    if not file_path:
        return jsonify({"error": "File path is required"}), 400
    
    local_image_path = os.path.join(temp_image_dir_user, os.path.basename(file_path))
    
    if os.path.exists(local_image_path):
        return jsonify({"image_path": f"/{local_image_path}"})
    else:
        if len(os.listdir(temp_image_dir_user))>0:
            file_to_delete = os.path.join(temp_image_dir_user, os.listdir(temp_image_dir_user)[0])
            # if switching to a new image, get rid of the temporary image stored locally
            # this is to prevent someone from selecting 100s of images and running up storage locally
            # only one image at a time
            os.remove(file_to_delete)
        # Download the image from cloud storage (use your Databricks API logic here)
        vc = VolumeClient(w, volume_path)
        local_image_path = vc.downloadFile(file_path, temp_image_dir_user)
        return jsonify({"image_path": f"/{local_image_path}"})

@app.route('/save_annotations', methods=['POST'])
def save_annotations():
    if ".env" in os.listdir(os.curdir):
        # this is only for local testing, no need for this environment variable when deployed
        user_email = os.getenv("TEST_REVIEWER")
    else:
        # this derives the email from the request header
        user_email = request.headers.get('X-Forwarded-Email', f'UnknownUser{uuid.uuid4()}')
    data = request.get_json()
    print(f"data={data}")
    image_data = data.get('image')
    volume_path = data.get('volumePath')


    # Decode the image data from the data URL
    image_data = image_data.split(',')[1]  # Remove the 'data:image/png;base64,' part
    image_bytes = base64.b64decode(image_data)
    

    # Save the annotated image - local
    image = Image.open(BytesIO(image_bytes))
    temp_image_dir_user = TEMP_IMAGE_DIR+f"/{user_email}"
    print(f"Temp Img Dir Name: {temp_image_dir_user}")
    file_name = os.listdir(temp_image_dir_user)[0].split(".")[0]+".png"
    print(f"File Name: {file_name}")
    image_path_dir = os.path.join(SAVE_IMG_FOLDER, user_email)
    image_path_file = os.path.join(SAVE_IMG_FOLDER, user_email, file_name)
    print(f"Image Path Name: {image_path_dir}")
    print(f"Image File Path Name: {image_path_file}")
    os.makedirs(image_path_dir, exist_ok=True)
    image.save(image_path_file)

    # Save the image - UC Volume
    vc = VolumeClient(w, volume_path)
    review_path_in_volume = volume_path+"/reviewed"+f"/{user_email}/{file_name}"
    print(f"reviewed: {review_path_in_volume}")

    temp_annotate_path = SAVE_IMG_FOLDER+f"/{user_email}/{file_name}"
    print(temp_annotate_path)
    temp_img_orginal_path = TEMP_IMAGE_DIR+f"/{user_email}/{file_name}"
    print(temp_img_orginal_path)

    try:
        vc.uploadFile(image_path_file, review_path_in_volume)
        temp_annotate_path = SAVE_IMG_FOLDER+f"/{user_email}/{file_name}"
        os.remove(temp_annotate_path)
    except Exception as e:
        print(e)

    try:
        #removing the original image
        temp_img_orginal_path = TEMP_IMAGE_DIR+f"/{user_email}/{file_name}"
        os.remove("./"+temp_img_orginal_path)
    except Exception as e:
        print(e)
    # Optionally, save the description to a file or database
    #print("Description:", description)
    # Get current UTC time
    #now_utc = datetime.now(timezone.utc)
    #formatted_timestamp = now_utc.strftime("%Y-%m-%d %H:%M:%S")
    #file_id = uuid.uuid4()
    
    # WRITE [ID, _TS, ORIGINAL_IMAGE_PATH, ANNOTATED_IMAGE_PATH, TXT_ANNOTATE, USER_EMAIL] row
    # maybe bring in dbsql library / functions?

    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(debug=True)