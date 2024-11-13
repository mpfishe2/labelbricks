from databricks.sdk import WorkspaceClient
from dotenv import load_dotenv
import os
import io

def ensure_directory_exists(file_path: str):
    """
    Ensures that the directory for the given file path exists.
    If the directory does not exist, it creates it.

    :param file_path: The full file path where the file will be saved.
    """
    directory = os.path.dirname(file_path)
    if not os.path.exists(directory):
        os.makedirs(directory)


class VolumeClient:
   def __init__(self, workspace_client, volume_uri) -> None:
        self.w = workspace_client
        self.volume_uri = volume_uri
    
   def listFiles(self, volume_dir, namesOrPaths="names"):
      # List the contents of a volume and either return the full filepaths or names of the files
      returnedPaths = []
      for item in self.w.files.list_directory_contents(self.volume_uri+f"/{volume_dir}"):
         if namesOrPaths=="names":
            print(item.name)
            returnedPaths.append(item.name)
         else:
            print(item.path)
            returnedPaths.append(item.path)
      return returnedPaths
      

   def makeDir(self, volume_dir):
       # Create an empty folder in a volume.
       try:
          self.w.files.create_directory(volume_dir)
          return True
       except Exception as e:
          print(e)
          return False

   def uploadFile(self, file_to_upload_file_path, volume_path_to_upload_to):
   
      try:
         # upload annotated image
         with open(file_to_upload_file_path, 'rb') as file:
            file_bytes = file.read()
            binary_data = io.BytesIO(file_bytes)
            self.w.files.upload(volume_path_to_upload_to, binary_data, overwrite = True)
            # clean up local file
            os.remove(file_to_upload_file_path)
            return True
      except Exception as e:
         print(e)
         return False

   def downloadFile(self, file_to_download_path, local_path):
      dr = self.w.files.download(file_to_download_path)
      file_name_clean = file_to_download_path.split("/")[-1]
      local_file_path = local_path+f"/{file_name_clean}"
      with open(local_file_path, 'wb') as local_file:
         local_file.write(dr.contents.read())
      
      return local_file_path


#load_dotenv()
#volume_folder = "testdir"
#volume_path = os.getenv("VOLUME_URI")
#volume_folder_path = f"{volume_path}"
#w = WorkspaceClient(host=os.getenv("FULL_DATABRICKS_HOST"), token=os.getenv("DATABRICKS_TOKEN_VALUE"))
#vc = VolumeClient(w, volume_path)
#vc.listFiles(volume_folder)
#local_file_path = "./tempimages/temp.png"
#dr = w.files.download("/Volumes/maxf_demos/default/image-store/testdir/image (16).png")
#print(dr)
#
#ensure_directory_exists(local_file_path)
#with open(local_file_path, 'wb') as local_file:
#   local_file.write(dr.contents.read())

