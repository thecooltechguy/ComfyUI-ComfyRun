# ComfyUI-ComfyRun

The easiest way to run & share any ComfyUI workflow

[https://comfyrun.com](https://comfyrun.com)

## Installation

```bash
cd ComfyUI/custom_nodes/
git clone https://github.com/thecooltechguy/ComfyUI-ComfyRun
cd ComfyUI-ComfyRun/
python -m pip install -r requirements.txt
``` 

Restart ComfyUI.

## Usage

### Deploying a local workflow to the cloud

1. Create a free account on [https://comfyrun.com](https://comfyrun.com)
2. Copy your **Share key** from [https://comfyrun.com/account](https://comfyrun.com/account)
3. Click on **Share via ComfyRun** on the ComfyUI menu.
4. Enter your **Share key** and a title for the workflow, and click **Upload workflow**.
5. ComfyRun will deploy your workflow to the cloud and return a URL where anyone can easily run it online, or run it locally.

### Importing & running an online workflow, locally

1. Click on **Import from ComfyRun** on the ComfyUI menu.
2. Enter the workflow URL that you want to run locally.
3. Click **Import workflow**.
5. ComfyRun will download the workflow and all of its necessary files, so that you can easily run it locally on your computer.
5. Restart ComfyUI before running the imported workflow.
