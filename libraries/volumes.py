import io
import logging
import os

from databricks.sdk import WorkspaceClient

logger = logging.getLogger(__name__)


class VolumeClient:
    def __init__(self, workspace_client: WorkspaceClient, volume_uri: str) -> None:
        self.w = workspace_client
        self.volume_uri = volume_uri

    def list_files(self, volume_dir: str, return_paths: bool = False) -> list[str]:
        """List contents of a volume directory, returning file names or full paths."""
        results: list[str] = []
        for item in self.w.files.list_directory_contents(f"{self.volume_uri}/{volume_dir}"):
            if return_paths:
                results.append(item.path)
            else:
                results.append(item.name)
        return results

    def make_dir(self, volume_dir: str) -> bool:
        """Create a directory in the volume."""
        try:
            self.w.files.create_directory(volume_dir)
            return True
        except Exception:
            logger.exception("Failed to create directory: %s", volume_dir)
            return False

    def upload_file(self, local_path: str, volume_path: str) -> bool:
        """Upload a local file to a volume path."""
        try:
            with open(local_path, "rb") as f:
                self.w.files.upload(volume_path, io.BytesIO(f.read()), overwrite=True)
            return True
        except Exception:
            logger.exception("Failed to upload file: %s -> %s", local_path, volume_path)
            return False

    def upload_bytes(self, data: bytes, volume_path: str) -> bool:
        """Upload in-memory bytes to a volume path."""
        try:
            self.w.files.upload(volume_path, io.BytesIO(data), overwrite=True)
            return True
        except Exception:
            logger.exception("Failed to upload bytes to: %s", volume_path)
            return False

    def download_file(self, file_path: str, local_dir: str) -> str:
        """Download a file from the volume to a local directory. Returns local file path."""
        file_name = file_path.split("/")[-1]
        local_file_path = os.path.join(local_dir, file_name)
        response = self.w.files.download(file_path)
        with open(local_file_path, "wb") as f:
            f.write(response.contents.read())
        return local_file_path

    def download_bytes(self, file_path: str) -> bytes:
        """Download a file from the volume as in-memory bytes."""
        response = self.w.files.download(file_path)
        return response.contents.read()
