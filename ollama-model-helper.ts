import * as vscode from 'vscode';
import ollama from 'ollama';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('ollama.initializePanel', async () => {
		const panel = vscode.window.createWebviewPanel(
			'deepchat',
			'Ollama based AI',
			vscode.ViewColumn.One,
			{ enableScripts: true }
		);

		// Resolve local file paths for marked.js and highlight.js
		const markedJsUri = panel.webview.asWebviewUri(vscode.Uri.file(
			context.extensionPath + '/media/marked.min.js'
		));
		const highlightJsUri = panel.webview.asWebviewUri(vscode.Uri.file(
			context.extensionPath + '/media/core.js'
		));
		const highlightCssUri = panel.webview.asWebviewUri(vscode.Uri.file(
			context.extensionPath + '/media/github-dark.min.css'
		));

		panel.webview.html = getWebViewContent(markedJsUri, highlightJsUri, highlightCssUri);

		panel.webview.onDidReceiveMessage(async (message: any) => {
			if (message.command === 'chat') {
				const userPrompt = message.text;
				const selectedModel = message.model || 'deepseek-r1:7b'; // Default model

				let responseText = '';

				try {
					const serverUrl = vscode.workspace.getConfiguration('ollama').get<string>('serverUrl') || 'http://localhost:11434';
					process.env.OLLAMA_HOST = serverUrl;

					const streamResponse = await ollama.chat({
						model: selectedModel,
						messages: [{ role: 'user', content: userPrompt }],
						stream: true
					});

					for await (const part of streamResponse) {
						responseText += part.message.content;
						panel.webview.postMessage({ command: 'chatResponse', text: responseText });
					}
				} catch (err) {
					console.error('Ollama Error:', err);
					panel.webview.postMessage({ command: 'chatResponse', text: "Error communicating with Ollama." });
				}
			}
		});
	});
}


function getWebViewContent(markedJsUri: vscode.Uri, highlightJsUri: vscode.Uri, highlightCssUri: vscode.Uri): string {
	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<style>
				body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
					margin: 1rem;
					display: flex;
					align-items: center;
					justify-content: center;
					flex-direction: column;
					}
				#modelSelect{
					background-color: black;
					color: white;
					font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
					font-size: 1rem; 
				}
				#prompt { 
					width: 100%; 
					box-sizing: 
					border-box; 
					min-height: 8rem; 
					background-color: rgba(8, 6, 19, 0.82); 
					color: white; 
					font-size: 2vh; 
					font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
					border-radius: 0.5rem;
				}
				#response { border: 1px solid #ccc; margin-top: 1rem; padding: 0.5rem; min-height: 10rem; width: 100%; background-color: rgba(0, 0, 0, 0.82); color: white; font-size: 2vh; border-radius: 0.5rem;}
				#askBtn {
					padding: 1rem; 
					background-color: rgb(84, 152, 189); 
					font-size: 2vh; 
					color: white; 
					font-weight: bold; 
					font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
					transition: 0.3s ease-in-out;
					border-radius: 0.5rem;
				}
				#askBtn:hover {
					cursor: pointer;
					color: black;
				}
				pre {
					background: #282c34;
					padding: 1rem;
					border-radius: 0.5rem;
					overflow-x: auto;
					position: relative;
				}
				code {
					font-family: "Fira Code", monospace;
					font-size: 2vh;
					color: #ffcc66;
				}
				.copy-button {
					position: absolute;
					right: 1rem;
					top: 0.5rem;
					background: #444;
					color: white;
					border: none;
					padding: 0.3rem 0.6rem;
					border-radius: 0.3rem;
					cursor: pointer;
				}
			</style>
			<link rel="stylesheet" href="${highlightCssUri}">
		</head>
		<body>
			<select id="modelSelect"></select><br />
			<textarea id="prompt" rows="3" placeholder="Ask something"></textarea><br />
			<button id="askBtn">Go</button>
			<div id="response"></div>

			<script src="${markedJsUri}"></script>
			<script src="${highlightJsUri}"></script>

			<script>
				const vscode = acquireVsCodeApi();
				const input = document.getElementById('prompt');
				const button = document.getElementById('askBtn');
				let models = [];

				// Fetch model list from API
				fetch('http://localhost:11434/api/tags')
					.then(response => response.json())
					.then(data => {
						models = data.models;
						const modelSelect = document.getElementById('modelSelect');

						// Populate the dropdown with model names
						models.forEach((model, index) => {
							const option = document.createElement('option');
							option.value = model.model;
							option.textContent = model.name;
							modelSelect.appendChild(option);
						});

						// Set default selection
						modelSelect.selectedIndex = 0;
					})
					.catch(error => console.error('Error fetching models:', error));

				function sendMessage() {
					const text = input.value.trim();
					const selectedModel = document.getElementById('modelSelect').value;
					if (text !== '') {
						vscode.postMessage({ command: 'chat', text, model: selectedModel });
						input.value = ''; // Clear input after sending
					}
				}

				button.addEventListener('click', sendMessage);

				input.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' && !event.shiftKey) { 
						event.preventDefault();
						sendMessage();
					}
				});

				window.addEventListener('message', event => {
					const { command, text } = event.data;
					if (command === 'chatResponse') {
						const responseDiv = document.getElementById('response');
						const rawHtml = marked.parse(text);
						responseDiv.innerHTML = rawHtml;

						// Apply syntax highlighting
						document.querySelectorAll('pre code').forEach(block => {
							hljs.highlightElement(block);
						});

						// Add copy buttons
						document.querySelectorAll('pre').forEach(pre => {
							if (!pre.querySelector('.copy-button')) {
								const button = document.createElement('button');
								button.innerText = 'Copy';
								button.classList.add('copy-button');
								button.onclick = () => {
									navigator.clipboard.writeText(pre.innerText);
									button.innerText = 'Copied!';
									setTimeout(() => (button.innerText = 'Copy'), 2000);
								};
								pre.appendChild(button);
							}
						});
					}
				});
			</script>
		</body>
		</html>
	`;
}


// This method is called when your extension is deactivated
export function deactivate() {}
