import io
import os
import shutil
import time
from typing import Callable
import aiofiles
import aiohttp
from aiohttp_retry import ExponentialRetry, RetryClient
import folder_paths
import server
import json
import os
from aiohttp import web
from blake3 import blake3
import git
from tqdm.asyncio import tqdm

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

comfy_path = os.path.dirname(folder_paths.__file__)
custom_nodes_path = os.path.join(comfy_path, 'custom_nodes')

CW_ENDPOINT = "https://comfyrun.com" #"http://localhost:3000"

import unicodedata
import re

def slugify(value, allow_unicode=False):
    """
    Taken from https://github.com/django/django/blob/master/django/utils/text.py
    Convert to ASCII if 'allow_unicode' is False. Convert spaces or repeated
    dashes to single dashes. Remove characters that aren't alphanumerics,
    underscores, or hyphens. Convert to lowercase. Also strip leading and
    trailing whitespace, dashes, and underscores.
    """
    value = str(value)
    if allow_unicode:
        value = unicodedata.normalize('NFKC', value)
    else:
        value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^\w\s-]', '', value.lower())
    return re.sub(r'[-\s]+', '-', value).strip('-_')


def get_current_snapshot():
    # Get ComfyUI hash (credit to ComfyUI-Manager for this function)
    repo_path = os.path.dirname(folder_paths.__file__)

    if not os.path.exists(os.path.join(repo_path, '.git')):
        print(f"ComfyUI update fail: The installed ComfyUI does not have a Git repository.")
        return web.Response(status=400)

    repo = git.Repo(repo_path)
    comfyui_commit_hash = repo.head.commit.hexsha

    git_custom_nodes = {}
    file_custom_nodes = []

    # Get custom nodes hash
    for path in os.listdir(custom_nodes_path):
        fullpath = os.path.join(custom_nodes_path, path)

        if os.path.isdir(fullpath):
            is_disabled = path.endswith(".disabled")

            try:
                git_dir = os.path.join(fullpath, '.git')

                if not os.path.exists(git_dir):
                    continue

                repo = git.Repo(fullpath)
                commit_hash = repo.head.commit.hexsha
                url = repo.remotes.origin.url
                git_custom_nodes[url] = {
                    'hash': commit_hash,
                    'disabled': is_disabled
                }

            except:
                print(f"Failed to extract snapshots for the custom node '{path}'.")

        elif path.endswith('.py'):
            is_disabled = path.endswith(".py.disabled")
            filename = os.path.basename(path)
            item = {
                'filename': filename,
                'disabled': is_disabled
            }

            file_custom_nodes.append(item)

    return {
        'comfyui': comfyui_commit_hash,
        'git_custom_nodes': git_custom_nodes,
        'file_custom_nodes': file_custom_nodes,
    }

def get_file_checksum(file_path):
    # BUF_SIZE is totally arbitrary, change for your app!
    BUF_SIZE = 65_536  # lets read stuff in 64kb chunks!
    hasher = blake3()
    with open(file_path, 'rb') as f:
        while True:
            data = f.read(BUF_SIZE)
            if not data:
                break
            hasher.update(data)
    return hasher.hexdigest()

def extract_file_names(json_data):
    """Extract unique file names from the input JSON data."""
    file_names = set()

    # Recursively search for file names in the JSON data
    def recursive_search(data):
        if isinstance(data, dict):
            for value in data.values():
                recursive_search(value)
        elif isinstance(data, list):
            for item in data:
                recursive_search(item)
        elif isinstance(data, str) and '.' in data:
            file_names.add(os.path.basename(data)) # file_names.add(data)

    recursive_search(json_data)
    return list(file_names)

def find_file_paths(base_dir, file_names):
    """Find the paths of the files in the base directory."""
    file_paths = {}

    for root, dirs, files in os.walk(base_dir):
        # Exclude certain directories
        dirs[:] = [d for d in dirs if d not in ['.git']]

        for file in files:
            if file in file_names:
                file_paths[file] = os.path.join(root, file)
    return file_paths

def set_comfyworkflows_auth(comfyworkflows_sharekey):
    with open(os.path.join(folder_paths.base_path, "comfyworkflows_sharekey"), "w") as f:
        f.write(comfyworkflows_sharekey)

def get_comfyworkflows_auth():
    if not os.path.exists(os.path.join(folder_paths.base_path, "comfyworkflows_sharekey")):
        return None
    try:
        with open(os.path.join(folder_paths.base_path, "comfyworkflows_sharekey"), "r") as f:
            share_key = f.read()
            if not share_key.strip():
                return None
        return share_key
    except:
        return None

@server.PromptServer.instance.routes.get("/cw/get_comfyworkflows_auth")
async def api_get_comfyworkflows_auth(request):
    # Check if the user has provided Matrix credentials in a file called 'matrix_accesstoken'
    # in the same directory as the ComfyUI base folder
    # print("Getting stored Comfyworkflows.com auth...")
    comfyworkflows_auth = get_comfyworkflows_auth()
    if not comfyworkflows_auth:
        return web.Response(status=404)
    return web.json_response({"comfyworkflows_sharekey" : comfyworkflows_auth})

class CallbackBytesIO(io.BytesIO):

    def __init__(self, callback: Callable, initial_bytes: bytes):
        self._callback = callback
        super().__init__(initial_bytes)

    def read(self, size=-1) -> bytes:
        data = super().read(size)
        self._callback(len(data))
        return data

DEPLOY_PROGRESS = {}
IMPORT_PROGRESS = {}

@server.PromptServer.instance.routes.get("/cw/deploy_progress")
async def api_comfyworkflows_deploy_progress(request):
    global DEPLOY_PROGRESS
    return web.json_response(DEPLOY_PROGRESS)

@server.PromptServer.instance.routes.get("/cw/import_progress")
async def api_comfyworkflows_import_progress(request):
    global IMPORT_PROGRESS
    return web.json_response(IMPORT_PROGRESS)

UPLOAD_CHUNK_SIZE = 100_000_000 # 100 MB

def get_num_chunks(file_size):
    global UPLOAD_CHUNK_SIZE
    num_chunks = file_size // UPLOAD_CHUNK_SIZE
    if file_size % UPLOAD_CHUNK_SIZE != 0:
        num_chunks += 1
    return num_chunks

@server.PromptServer.instance.routes.post("/cw/import_from_url")
async def api_comfyworkflows_import_from_url(request):
    global IMPORT_PROGRESS
    json_data = await request.json()

    url = json_data['url']

    print("Importing workflow from URL: ", url)

    # transform the url by replacing the /run/ with /api/import_from_url/
    if "/api/import_from_url" not in url:
        url = url.replace("/w/", "/api/import_from_url/")

    # Replace the domain name in the url with CW_ENDPOINT
    import urllib.parse
    parsed_url = urllib.parse.urlparse(url)
    url = url.replace(parsed_url.netloc, CW_ENDPOINT.replace("http://", "").replace("https://", ""))
    print("Transformed URL: ", url)

    async with aiohttp.ClientSession(trust_env=True, connector=aiohttp.TCPConnector(verify_ssl=False)) as session:
        retry_client = RetryClient(session, retry_options=ExponentialRetry(attempts=3))

        async with retry_client.post(
            url,
        ) as resp:
            assert resp.status == 200
            import_json = await resp.json()
            workflow = import_json['workflow']
            workflow_files = import_json['workflow_files']

            title = workflow['title']
            description = workflow['description']
            workflow_json = json.loads(workflow['workflow_json'])
            snapshot_json = json.loads(workflow['snapshot_json'])

            num_downloaded_files = 0
            for workflow_file in workflow_files:
                dest_relative_path = workflow_file['dest_relative_path']
                checksum = workflow_file['checksum']
                file_url = workflow_file['object_key']

                # Check if the file already exists locally
                base_path = folder_paths.base_path

                dest_file_path = os.path.join(base_path, dest_relative_path)

                if os.path.exists(dest_file_path):
                    # Check the checksum
                    file_checksum = get_file_checksum(dest_file_path)
                    if file_checksum == checksum:
                        print(f"Skipping file {dest_relative_path} because it already exists locally.")
                        num_downloaded_files += 1
                        IMPORT_PROGRESS = {
                            "title" : title,
                            "description" : description,
                            "status" : f"downloading files... ({round(100.0 * num_downloaded_files / len(workflow_files), 2)}%)",
                        }
                        continue

                print(f"Downloading file: {os.path.basename(dest_file_path)}...")
                IMPORT_PROGRESS = {
                    "title" : title,
                    "description" : description,
                    "status" : f"downloading files... ({round(100.0 * num_downloaded_files / len(workflow_files), 2)}%)",
                }

                # Download the file in chunks
                async with retry_client.get(file_url) as resp:
                    assert resp.status == 200

                    # create parent directories if they don't exist
                    os.makedirs(os.path.dirname(dest_file_path), exist_ok=True)

                    with open(dest_file_path, 'wb') as f:
                        chunk = await resp.content.read(1024)
                        while chunk:
                            f.write(chunk)
                            chunk = await resp.content.read(1024)
                            
                # Check the checksum
                file_checksum = get_file_checksum(dest_file_path)
                if file_checksum != checksum:
                    IMPORT_PROGRESS = {}
                    return web.json_response({"error": f"File checksum mismatch for file: {os.path.basename(dest_file_path)}."}, status=400)
                    # raise Exception(f"File checksum mismatch for file: {os.path.basename(dest_file_path)}.")
                
                num_downloaded_files += 1
                IMPORT_PROGRESS = {
                    "title" : title,
                    "description" : description,
                    "status" : f"downloading files... ({round(100.0 * num_downloaded_files / len(workflow_files), 2)}%)",
                }
            
            IMPORT_PROGRESS = {
                "title" : title,
                "description" : description,
                "status" : f"importing snapshot...",
            }
            # First, take a snapshot of the current state of ComfyUI and save it to base_path/custom_nodes/ComfyUI-Manager/snapshots/CW-BeforeImport-<datetime>.json
            current_snapshot = get_current_snapshot()

            # Save it to local disk
            snapshot_filename = f"CW-BeforeImport-{slugify(title or '')}-{time.strftime('%Y-%m-%d-%H-%M-%S')}.json"
            snapshot_path = os.path.join(base_path, "custom_nodes", "ComfyUI-Manager", "snapshots", snapshot_filename)

            # create parent directories if they don't exist
            os.makedirs(os.path.dirname(snapshot_path), exist_ok=True)

            with open(snapshot_path, 'w') as f:
                json.dump(current_snapshot, f, indent=4)

            # Now, write the new snapshot to disk
            snapshot_filename = f"CW-Import-{slugify(title or '')}-{time.strftime('%Y-%m-%d-%H-%M-%S')}.json"
            snapshot_path = os.path.join(base_path, "custom_nodes", "ComfyUI-Manager", "snapshots", snapshot_filename)

            with open(snapshot_path, 'w') as f:
                json.dump(snapshot_json, f, indent=4)

            # Now, schedule the snapshot restore
            startup_scripts_path = os.path.join(base_path, "custom_nodes", "ComfyUI-Manager", "startup-scripts")
            restore_snapshot_filepath = os.path.join(startup_scripts_path, "restore-snapshot.json")
            shutil.copy(snapshot_path, restore_snapshot_filepath)

            print(f"Snapshot restore scheduled: `{restore_snapshot_filepath}`")
    IMPORT_PROGRESS = {
        "title" : title,
        "description" : description,
        "status" : f"Imported workflow! Please restart ComfyUI to run it.",
    }
    return web.json_response({"workflow": workflow_json, "title": title, "description": description})


@server.PromptServer.instance.routes.post("/cw/deploy")
async def api_comfyworkflows_deploy(request):
    global DEPLOY_PROGRESS
    print("Deploying workflow...")
    json_data = await request.json()

    cw_auth = json_data['cw_auth']['cw_sharekey']
    title = json_data['title']
    description = json_data.get('description')
    prompt = json_data['prompt']
    filteredNodeTypeToNodeData = json_data['filteredNodeTypeToNodeData']

    set_comfyworkflows_auth(cw_auth)

    # Example usage
    base_directory = folder_paths.base_path #"./"

    # Parse the JSON
    parsed_json = prompt

    DEPLOY_PROGRESS = {
        "status" : "preparing upload...",
    }

    # Extract file names
    file_names = set(extract_file_names(parsed_json))
    print("File names: ", file_names)

    # Find file paths
    file_paths = find_file_paths(base_directory, file_names)
    print("File paths: ", file_paths)

    all_file_info = {}
    for file_name, file_path in file_paths.items():
        file_checksum = get_file_checksum(file_path)
        all_file_info[file_name] = {
            'path': file_path,
            'size': os.path.getsize(file_path),
            'dest_relative_path': os.path.relpath(file_path, base_directory),
            'checksum': file_checksum
        }

    total_num_chunks = 0
    for file_name, file_info in all_file_info.items():
        num_chunks = get_num_chunks(file_info['size'])
        total_num_chunks += num_chunks

    DEPLOY_PROGRESS = {
        "status" : "creating snapshot...",
    }

    # Compute snapshot
    snapshot_json = get_current_snapshot()
    # print("Current snapshot json:")
    # print(snapshot_json)

    async def file_sender(file_name=None):
        async with aiofiles.open(file_name, 'rb') as f:
            chunk = await f.read(64*1024)
            while chunk:
                yield chunk
                chunk = await f.read(64*1024)

    raise_for_status = {x for x in range(100, 600)}
    raise_for_status.remove(200)
    raise_for_status.remove(429)

    # First, create the runnable workflow object
    async with aiohttp.ClientSession(trust_env=True, connector=aiohttp.TCPConnector(verify_ssl=False)) as session:
        retry_client = RetryClient(session, retry_options=ExponentialRetry(attempts=3), raise_for_status=raise_for_status)
        
        form = aiohttp.FormData()
        form.add_field("shareKey", cw_auth)
        form.add_field("source", "comfyui_comfyworkflows")
        form.add_field("title", title)
        if description:
            form.add_field("description", description)
        form.add_field("workflowJson", json.dumps(prompt))
        form.add_field("snapshotJson", json.dumps(snapshot_json))
        form.add_field("filteredNodeTypeToNodeData", json.dumps(filteredNodeTypeToNodeData))

        async with retry_client.post(
            f"{CW_ENDPOINT}/api/create_runnable_workflow",
            data=form,
        ) as resp:
            assert resp.status == 200
            upload_workflow_json = await resp.json()
            workflowId = upload_workflow_json["workflowId"]

        # Now, we upload each file
        DEPLOY_PROGRESS = {
            "status" : f"uploading files... (0%)",
        }
        total_num_files = len(all_file_info)
        current_file_index = -1
        num_chunks_uploaded = 0
        for file_name, file_info in all_file_info.items():
            # print(f"Going to upload file: {file_name}...")
            DEPLOY_PROGRESS = {
                "status" : f"uploading files... ({round(100.0 * num_chunks_uploaded / total_num_chunks, 2)}%)",
            }

            num_chunks_for_file = get_num_chunks(file_info['size'])
            current_file_index += 1
            async with retry_client.post(
                f"{CW_ENDPOINT}/api/get_presigned_url_for_runnable_workflow_file",
                json={
                    "dest_relative_path" : file_info['dest_relative_path'],
                    "checksum": file_info['checksum'],
                    "runnable_workflow_id": workflowId,
                    "shareKey": cw_auth,
                    'size': file_info['size'],
                },
            ) as resp:
                assert resp.status == 200
                upload_json = await resp.json()

                if upload_json['uploadFile'] == False:
                    print(f"Skipping file {file_name} because it already exists in the cloud.")
                    num_chunks_uploaded += num_chunks_for_file
                    continue
                
                uploadId = upload_json['uploadId']
                presigned_urls = upload_json['signedUrlsList']
                objectKey = upload_json['objectKey']

                # print(presigned_url)
                # print("Uploading file: {0}".format(file_info['path']))
                t = time.time()
                # headers = {
                #     "Content-Length": str(file_info['size']),
                # }
                # print(headers)
                # progress_bar = tqdm(
                #     desc=f"Uploading {os.path.basename(file_info['path'])}",
                #     unit="B",
                #     unit_scale=True,
                #     total=file_info['size'],
                #     unit_divisor=1024,
                # )

                # with open(file_info['path'], "rb") as f:
                #     file_data = CallbackBytesIO(progress_bar.update, f.read())
                
                parts = []

                progress_bar = tqdm(
                    desc=f"Uploading file ({(current_file_index + 1)}/{total_num_files}) {os.path.basename(file_info['path'])}",
                    unit="B",
                    unit_scale=True,
                    total=file_info['size'],
                    unit_divisor=1024,
                )

                with open(file_info['path'], "rb") as f:
                    chunk_index = 0
                    while True:
                        data = f.read(UPLOAD_CHUNK_SIZE)
                        if not data:
                            # print("Finished uploading file. ", chunk_index, UPLOAD_CHUNK_SIZE)
                            break

                        max_retries = 5
                        num_retries = 0
                        while num_retries < max_retries:
                            try:
                                async with retry_client.put(presigned_urls[chunk_index],data=data) as resp:
                                    assert resp.status == 200
                                    parts.append({
                                        'ETag': resp.headers['ETag'],
                                        'PartNumber': chunk_index + 1,
                                    })
                                    break
                            except:
                                num_retries += 1
                                # print(f"Failed to upload chunk {chunk_index} of file {file_name} to {presigned_urls[chunk_index]}... retrying ({num_retries}/{max_retries})")
                                if num_retries == max_retries:
                                    raise Exception(f"Failed to upload file {os.path.basename(file_info['path'])} after {max_retries} retries.")

                        progress_bar.update(len(data))

                        chunk_index += 1
                        
                        num_chunks_uploaded += 1
                        DEPLOY_PROGRESS = {
                            "status" : f"uploading files... ({round(100.0 * num_chunks_uploaded / total_num_chunks, 2)}%)",
                        }

                # Complete the multipart upload
                async with retry_client.post(
                    f"{CW_ENDPOINT}/api/complete_multipart_upload_for_runnable_workflow_file",
                    json={
                        "parts": parts,
                        "objectKey": objectKey,
                        "uploadId": uploadId,
                        "shareKey": cw_auth,
                    },
                ) as resp:
                    assert resp.status == 200
                # print("Upload took {0} seconds".format(time.time() - t))
        workflow_deploy_url = f"{CW_ENDPOINT}/w/{workflowId}"
        DEPLOY_PROGRESS = {}
        print("\n\n")
        print(f"Successfully deployed workflow: ", workflow_deploy_url)

        # Now, return a json response with the workflow ID
        return web.json_response({"deploy_url": workflow_deploy_url})