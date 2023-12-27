import { app } from "../../../scripts/app.js";
import { api } from '../../../scripts/api.js'
// import { ComfyWidgets } from "../../../scripts/widgets.js"
import { ComfyDialog, $el } from "../../../scripts/ui.js";
// import { ShareDialog, SUPPORTED_OUTPUT_NODE_TYPES, getPotentialOutputsAndOutputNodes } from "./comfyui-share.js";

var docStyle = document.createElement('style');

//   flex-wrap: wrap;
docStyle.innerHTML = `
.cw-menu-container {
  column-gap: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.cw-menu-column {
  display: flex;
  flex-direction: column;
}

.cw-title {
	padding: 10px 10px 0 10p;
	background-color: black;
	text-align: center;
	height: 45px;
}
`;

document.head.appendChild(docStyle);

var badge_mode = "none";

// copied style from https://github.com/pythongosssss/ComfyUI-Custom-Scripts
const style = `
#comfyworkflows-button {
	position: relative;
	overflow: hidden;
 } 
.pysssss-workflow-arrow-2 {
   position: absolute;
   top: 0;
   bottom: 0;
   right: 0;
   font-size: 12px;
   display: flex;
   align-items: center;
   width: 24px;
   justify-content: center;
   background: rgba(255,255,255,0.1);
   content: "▼";
}
.pysssss-workflow-arrow-2:after {
	content: "▼";
 }
 .pysssss-workflow-arrow-2:hover {
	filter: brightness(1.6);
	background-color: var(--comfy-menu-bg);
 }
.pysssss-workflow-popup-2 ~ .litecontextmenu {
	transform: scale(1.3);
}
#comfyworkflows-button-menu {
	z-index: 10000000000 !important;
}
`;


export var cw_instance = null;
export var cw_import_instance = null;

export function setCWInstance(obj) {
	cw_instance = obj;
}

export function setCWImportInstance(obj) {
	cw_import_instance = obj;
}

async function fetchNicknames() {
	const response1 = await api.fetchApi(`/customnode/getmappings?mode=local`);
	const mappings = await response1.json();

	let result = {};

	for (let i in mappings) {
		let item = mappings[i];
		var nickname;
		if (item[1].title) {
			nickname = item[1].title;
		}
		else {
			nickname = item[1].title_aux;
		}

		for (let j in item[0]) {
			result[item[0][j]] = nickname;
		}
	}

	return result;
}

let nicknames = await fetchNicknames();


function newDOMTokenList(initialTokens) {
	const tmp = document.createElement(`div`);

	const classList = tmp.classList;
	if (initialTokens) {
		initialTokens.forEach(token => {
			classList.add(token);
		});
	}

	return classList;
}

const NODE_TYPE_X_NODE_DATA = {};


// -----------
class CWMenuDialog extends ComfyDialog {
	static cw_sharekey = "";

	constructor() {
		super();

		this.cw_sharekey_input = $el("input", { type: 'text', placeholder: "Share key (found on your profile page)", value: CWMenuDialog.cw_sharekey || '' }, []);
		this.cw_sharekey_input.style.width = "100%";

		// get the user's existing comfyworkflows share key
		CWMenuDialog.cw_sharekey = "";
		try {
			// console.log("Fetching comfyworkflows share key")
			api.fetchApi(`/cw/get_comfyworkflows_auth`)
				.then(response => response.json())
				.then(data => {
					CWMenuDialog.cw_sharekey = data.comfyworkflows_sharekey;
					this.cw_sharekey_input.value = CWMenuDialog.cw_sharekey;
				})
				.catch(error => {
					// console.log(error);
				});
		} catch (error) {
			// console.log(error);
		}

		this.title_input = $el("input", {
			type: "text",
			placeholder: "ex: Upscaling workflow",
			required: true
		}, []);

		this.description_input = $el("textarea", {
			placeholder: "ex: Trying out a new workflow for upscaling... ",
			required: false,
		}, []);

		this.final_message = $el("div", {
			style: {
				color: "white",
				textAlign: "center",
				// marginTop: "10px",
				// backgroundColor: "black",
				padding: "10px",
			}
		}, []);

		this.deploy_button = $el("button", {
			type: "submit",
			textContent: "Upload workflow",
			style: {
				backgroundColor: "blue"
			}
		}, []);

		const close_button = $el("button", {
			type: "button", textContent: "Close", onclick: () => {
				// Reset state
				this.deploy_button.textContent = "Upload workflow";
				this.deploy_button.style.display = "inline-block";
				this.final_message.innerHTML = "";
				this.final_message.style.color = "white";
				this.title_input.value = "";
				this.description_input.value = "";
				// this.is_nsfw_checkbox.checked = false;

				this.close()
			}
		});

		const content =
			$el("div.cw-menu-container", //"div.comfy-modal-content",
				[
					$el("tr.cw-title", { width: "100%" }, [
						$el("font", { size: 6, color: "white" }, [`Upload your workflow to ComfyRun.com`])]
					),
					$el("br", {}, []),

					// add "share key" input (required), "title" input (required), "description" input (optional)
					// $el("div.cw-menu-container", {width:"100%"}, [
					$el("div.cw-menu-container", [
						$el("details", {
							style: {
								border: "1px solid #999",
								marginTop: "10px",
								padding: "5px",
								borderRadius: "5px",
								backgroundColor: "#222"
							}
						}, [
							$el("summary", {
								style: {
									color: "white",
									cursor: "pointer",
								}
							}, [`ComfyRun.com account`]),
							$el("h4", {
								textContent: "Share key (found at: https://comfyrun.com/account)",
							}, []),
							$el("p", { size: 3, color: "white" }, ["Your uploaded workflow will be saved to your account."]),
							this.cw_sharekey_input,
						]),


						$el("h4", {
							textContent: "Title",
							size: 3,
							color: "white",
							style: {
								color: 'white'
							}
						}, []),
						this.title_input,
						// $el("br", {}, []),

						$el("h4", {
							textContent: "Description (optional)",
							size: 3,
							color: "white",
							style: {
								color: 'white'
							}
						}, []),
						this.description_input,
						$el("br", {}, []),

						// $el("div", {}, [this.is_nsfw_checkbox, is_nsfw_checkbox_text]),
						// $el("br", {}, []),

						this.final_message,
						$el("br", {}, []),

					]),
					this.deploy_button,
					close_button,
				],
			);

		this.deploy_button.onclick = async () => {
			if (!this.cw_sharekey_input.value) {
				alert("Please enter your ComfyRun.com account's share key.");
				return;
			}

			if (!this.title_input.value) {
				alert("Please enter a title for your workflow.");
				return;
			}

			const prompt = await app.graphToPrompt();

			const workflowNodes = prompt.workflow.nodes;
			const filteredNodeTypeToNodeData = {};
			for (const workflowNode of workflowNodes) {
				const workflowNodeData = NODE_TYPE_X_NODE_DATA[workflowNode.type];
				if (workflowNodeData) {
					filteredNodeTypeToNodeData[workflowNode.type] = workflowNodeData;
				}
			}

			// Change the text of the share button to "Sharing..." to indicate that the share process has started
			this.deploy_button.textContent = "Deploying...";
			this.final_message.style.color = "white"; //"green";
			const initialFinalMessage = "This may take a few minutes. Please do not close this window. See the console for upload progress.";
			this.final_message.innerHTML = initialFinalMessage;

			// set an interval to call /cw/deploy_progress every 1 second to get the upload progress and set the text of the final message
			// cancel the interval once the /cw/deploy endpoint returns a response

			const deployProgressInterval = setInterval(async () => {
				const deployProgressResp = await api.fetchApi(`/cw/deploy_progress`, {
					method: 'GET',
					headers: { 'Content-Type': 'application/json' },
				});

				if (deployProgressResp.status == 200) {
					try {
						const deployProgressResp_json = await deployProgressResp.json();
						const statusText = deployProgressResp_json.status;
						if (statusText) {
							this.final_message.innerHTML = initialFinalMessage + "<br/><br/>" + statusText;
						}
					} catch (e) {
						// console.log(e);
					}
				}
			}, 1_000);

			const response = await api.fetchApi(`/cw/deploy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cw_auth: {
						cw_sharekey: this.cw_sharekey_input.value,
					},
					title: this.title_input.value,
					description: this.description_input.value,
					// is_nsfw: this.is_nsfw_checkbox.checked,
					prompt,
					filteredNodeTypeToNodeData
				})
			});

			clearInterval(deployProgressInterval);

			if (response.status != 200) {
				try {
					const response_json = await response.json();
					if (response_json.error) {
						alert(response_json.error);
						this.deploy_button.textContent = "Upload workflow";
						this.deploy_button.style.display = "inline-block";
						this.final_message.innerHTML = "";
						this.final_message.style.color = "white";
						this.title_input.value = "";
						this.description_input.value = "";		
						this.close();
						return;
					} else {
						alert("Failed to deploy your workflow. Please try again.");
						this.deploy_button.textContent = "Upload workflow";
						this.deploy_button.style.display = "inline-block";
						this.final_message.innerHTML = "";
						this.final_message.style.color = "white";
						this.title_input.value = "";
						this.description_input.value = "";		
						this.close();
						return;
					}
				} catch (e) {
					alert("Failed to deploy your workflow. Please try again.");
					this.deploy_button.textContent = "Upload workflow";
					this.deploy_button.style.display = "inline-block";
					this.final_message.innerHTML = "";
					this.final_message.style.color = "white";
					this.title_input.value = "";
					this.description_input.value = "";	
					this.close();
					return;
				}
			}

			const response_json = await response.json();

			if (response_json.deploy_url) {
				this.final_message.innerHTML = "Your workflow has been deployed: <a style='color:#ffffff;' href='" + response_json.deploy_url + "' target='_blank'>" + response_json.deploy_url + "</a>";
			}

			this.final_message.style.color = "white"; //"green";

			// hide #comfyui-share-container and show #comfyui-share-finalmessage-container
			// this.share_container.style.display = "none";
			// this.share_finalmessage_container.style.display = "block";

			// hide the share button
			this.deploy_button.textContent = "Deployed!";
			this.deploy_button.style.display = "none";
			// this.close();
		}


		content.style.width = '100%';
		content.style.height = '100%';

		this.element = $el("div.comfy-modal", { parent: document.body }, [content]);
		this.element.style.width = '1000px';
		// this.element.style.height = '400px';
		this.element.style.zIndex = 10000;
	}

	show() {
		this.element.style.display = "block";
	}
}

class CWImportMenuDialog extends ComfyDialog {
	static cw_sharekey = "";

	constructor() {
		super();
		this.title_input = $el("input", {
			type: "text",
			placeholder: "https://comfyrun.com/w/workflowToImport",
			required: true
		}, []);

		this.final_message = $el("div", {
			style: {
				color: "white",
				textAlign: "center",
				// marginTop: "10px",
				// backgroundColor: "black",
				padding: "10px",
			}
		}, []);

		this.import_button = $el("button", {
			type: "submit",
			textContent: "Import workflow from URL",
			style: {
				backgroundColor: "blue"
			}
		}, []);

		const close_button = $el("button", {
			type: "button", textContent: "Close", onclick: () => {
				// Reset state
				this.import_button.textContent = "Import workflow from URL";
				this.import_button.style.display = "inline-block";
				this.final_message.innerHTML = "";
				this.final_message.style.color = "white";
				this.title_input.value = "";
				this.close()
			}
		});

		const content =
			$el("div.cw-menu-container", //"div.comfy-modal-content",
				[
					$el("tr.cw-title", { width: "100%" }, [
						$el("font", { size: 6, color: "white" }, [`Import workflow from ComfyRun.com`])]
					),
					$el("br", {}, []),

					// $el("div.cw-menu-container", {width:"100%"}, [
					$el("div.cw-menu-container", [
						$el("h4", {
							textContent: "Import workflow from ComfyRun.com URL",
							size: 3,
							color: "white",
							style: {
								color: 'white'
							}
						}, []),
						this.title_input,
						$el("br", {}, []),

						this.final_message,
						$el("br", {}, []),

					]),
					this.import_button,
					close_button,
				],
			);

		this.import_button.onclick = async () => {
			if (!this.title_input.value) {
				alert("Please enter the workflow URL to import.");
				return;
			}

			const prompt = await app.graphToPrompt();
			
			// Trigger a download of the prompt json as a json file before importing the new workflow
			const promptJson = JSON.stringify(prompt);
			const promptBlob = new Blob([promptJson], { type: 'application/json' });
			const promptUrl = URL.createObjectURL(promptBlob);
			const promptLink = document.createElement('a');

			promptLink.style.display = 'none';
			promptLink.href = promptUrl;
			promptLink.download = 'workflow_before_import.json';
			document.body.appendChild(promptLink);
			promptLink.click();
			document.body.removeChild(promptLink);
			URL.revokeObjectURL(promptUrl);

			this.import_button.textContent = "Importing...";
			this.final_message.style.color = "white"; //"green";
			const initialFinalMessage = "This may take a few minutes. Please do not close this window. See the console for import progress.";
			this.final_message.innerHTML = initialFinalMessage;

			// set an interval to call /cw/import_progress every 1 second to get the upload progress and set the text of the final message
			// cancel the interval once the /cw/import_from_url endpoint returns a response
			const importProgressInterval = setInterval(async () => {
				const importProgressResp = await api.fetchApi(`/cw/import_progress`, {
					method: 'GET',
					headers: { 'Content-Type': 'application/json' },
				});

				if (importProgressResp.ok) {
					try {
						const importProgressResp_json = await importProgressResp.json();
						const statusText = importProgressResp_json.status;
						if (statusText) {
							if (statusText.startsWith("Imported workflow")) {
								this.final_message.innerHTML = statusText;
							} else {
								this.final_message.innerHTML = initialFinalMessage + "<br/><br/>" + statusText;
							}
						}
					} catch (e) {
						// console.log(e);
					}
				}
			}, 1_000);

			const response = await api.fetchApi(`/cw/import_from_url`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url: this.title_input.value,
				})
			});

			clearInterval(importProgressInterval);

			if (!response.ok) {
				try {
					const response_json = await response.json();
					if (response_json.error) {
						alert(response_json.error);
						this.import_button.textContent = "Import workflow from URL";
						this.import_button.style.display = "inline-block";
						this.final_message.innerHTML = "";
						this.final_message.style.color = "white";
						this.title_input.value = "";
						this.close();
						return;
					} else {
						alert("Failed to import workflow. Please try again.");
						this.import_button.textContent = "Import workflow from URL";
						this.import_button.style.display = "inline-block";
						this.final_message.innerHTML = "";
						this.final_message.style.color = "white";
						this.title_input.value = "";
						this.close();
						return;
					}
				} catch (e) {
					alert("Failed to import workflow. Please try again.");
					this.import_button.textContent = "Import workflow from URL";
					this.import_button.style.display = "inline-block";
					this.final_message.innerHTML = "";
					this.final_message.style.color = "white";
					this.title_input.value = "";
					this.close();
					return;
				}
			}

			const response_json = await response.json();
			console.log(response_json);

			if (response_json.workflow.workflow) {
				// set the graph to the imported workflow
				await app.loadGraphData(response_json.workflow.workflow);

				// save the graph to local storage so that it can be loaded again once comfyui is restarted
				localStorage.setItem("workflow", JSON.stringify(app.graph.serialize()));
			}

			this.final_message.style.color = "white"; //"green";

			this.import_button.textContent = "Imported workflow! Please restart ComfyUI to run it.";
			this.import_button.style.display = "none";
		}


		content.style.width = '100%';
		content.style.height = '100%';

		this.element = $el("div.comfy-modal", { parent: document.body }, [content]);
		this.element.style.width = '1000px';
		// this.element.style.height = '400px';
		this.element.style.zIndex = 10000;
	}

	show() {
		this.element.style.display = "block";
	}
}

app.registerExtension({
	name: "ComfyUI.ComfyWorkflows",
	init() {
		$el("style", {
			textContent: style,
			parent: document.head,
		});
	},
	async setup() {
		// console.log(JSON.stringify(NODE_TYPE_X_NODE_DATA));
		const menu = document.querySelector(".comfy-menu");
		const separator = document.createElement("hr");

		separator.style.margin = "20px 0";
		separator.style.width = "100%";
		menu.append(separator);

		const deployButton = document.createElement("button");
		deployButton.textContent = "Share via ComfyRun";
		deployButton.onclick = () => {
			if (!cw_instance)
				setCWInstance(new CWMenuDialog());
			cw_instance.show();
		}
		menu.append(deployButton);

		const importButton = document.createElement("button");
		importButton.textContent = "Import from ComfyRun";
		importButton.onclick = () => {
			if (!cw_import_instance)
				setCWImportInstance(new CWImportMenuDialog());
			cw_import_instance.show();
		}
		menu.append(importButton);
	},

	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		NODE_TYPE_X_NODE_DATA[nodeData.name] = nodeData;

		const onDrawForeground = nodeType.prototype.onDrawForeground;
		nodeType.prototype.onDrawForeground = function (ctx) {
			const r = onDrawForeground?.apply?.(this, arguments);

			if (!this.flags.collapsed && badge_mode != 'none' && nodeType.title_mode != LiteGraph.NO_TITLE) {
				let text = "";
				if (badge_mode == 'id_nick')
					text = `#${this.id} `;

				if (nicknames[nodeData.name.trim()]) {
					let nick = nicknames[nodeData.name.trim()];

					if (nick.length > 25) {
						text += nick.substring(0, 23) + "..";
					}
					else {
						text += nick;
					}
				}

				if (text != "") {
					let fgColor = "white";
					let bgColor = "#0F1F0F";
					let visible = true;

					ctx.save();
					ctx.font = "12px sans-serif";
					const sz = ctx.measureText(text);
					ctx.fillStyle = bgColor;
					ctx.beginPath();
					ctx.roundRect(this.size[0] - sz.width - 12, -LiteGraph.NODE_TITLE_HEIGHT - 20, sz.width + 12, 20, 5);
					ctx.fill();

					ctx.fillStyle = fgColor;
					ctx.fillText(text, this.size[0] - sz.width - 6, -LiteGraph.NODE_TITLE_HEIGHT - 6);
					ctx.restore();
				}
			}
			return r;
		};
	},

	async loadedGraphNode(node, app) {
		if (node.has_errors) {
			const onDrawForeground = node.onDrawForeground;
			node.onDrawForeground = function (ctx) {
				const r = onDrawForeground?.apply?.(this, arguments);

				if (!this.flags.collapsed && badge_mode != 'none') {
					let text = "";
					if (badge_mode == 'id_nick')
						text = `#${this.id} `;

					if (nicknames[node.type.trim()]) {
						let nick = nicknames[node.type.trim()];

						if (nick.length > 25) {
							text += nick.substring(0, 23) + "..";
						}
						else {
							text += nick;
						}
					}

					if (text != "") {
						let fgColor = "white";
						let bgColor = "#0F1F0F";
						let visible = true;

						ctx.save();
						ctx.font = "12px sans-serif";
						const sz = ctx.measureText(text);
						ctx.fillStyle = bgColor;
						ctx.beginPath();
						ctx.roundRect(this.size[0] - sz.width - 12, -LiteGraph.NODE_TITLE_HEIGHT - 20, sz.width + 12, 20, 5);
						ctx.fill();

						ctx.fillStyle = fgColor;
						ctx.fillText(text, this.size[0] - sz.width - 6, -LiteGraph.NODE_TITLE_HEIGHT - 6);
						ctx.restore();

						ctx.save();
						ctx.font = "bold 14px sans-serif";
						const sz2 = ctx.measureText(node.type);
						ctx.fillStyle = 'white';
						ctx.fillText(node.type, this.size[0] / 2 - sz2.width / 2, this.size[1] / 2);
						ctx.restore();
					}
				}

				return r;
			};
		}
	}
});