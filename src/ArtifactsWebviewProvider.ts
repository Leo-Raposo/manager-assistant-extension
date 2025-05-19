import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Esta classe gerenciará a visualização webview personalizada para a extensão
export class ArtifactsWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'managerAssistantExplorer';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly artifactsProvider: any,
        private readonly historyProvider: any
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Escuta mensagens da webview
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'applyFilters':
                    this.historyProvider.setAuthorFilter(data.author);
                    this.historyProvider.setTaskIdFilter(data.taskId);
                    this.historyProvider.refresh();
                    break;
                case 'clearFilters':
                    this.historyProvider.setAuthorFilter('');
                    this.historyProvider.setTaskIdFilter('');
                    this.historyProvider.refresh();
                    break;
                case 'getArtifacts':
                    // Envia os artefatos atuais para a webview
                    await this.updateArtifactsList();
                    break;
                case 'loadCommit':
                    // Carrega um commit específico
                    vscode.commands.executeCommand('manager-assistant.loadCommitArtifacts', { id: data.commitId });
                    break;
                case 'copyArtifact':
                    // Copia um artefato específico
                    this.copyArtifactLink(data.path, data.commitHash);
                    break;
                case 'copyAllArtifacts':
                    // Copia todos os artefatos
                    this.copyAllArtifactsLinks();
                    break;
                case 'executeCommand':
                    // Executa um comando do VSCode
                    if (data.command) {
                        vscode.commands.executeCommand(data.command);
                    }
                    break;
            }
        });

        // Atualiza inicialmente os valores de filtro na webview
        this._view.webview.postMessage({
            type: 'updateFilters',
            author: this.historyProvider.currentAuthorFilter,
            taskId: this.historyProvider.currentTaskIdFilter
        });
    }

    // Atualiza a lista de artefatos na webview
    public async updateArtifactsList() {
        if (!this._view) {
            return;
        }

        const artifacts = this.artifactsProvider.artifacts;
        const commitHash = this.artifactsProvider.commitHash;

        this._view.webview.postMessage({
            type: 'updateArtifacts',
            artifacts: artifacts,
            commitHash: commitHash
        });
    }

    // Copia o link de um artefato específico
    private copyArtifactLink(artifactPath: string, commitHash: string) {
        const artifact = this.artifactsProvider.artifacts.find((a: any) => a.path === artifactPath);
        if (artifact) {
            const prefix = artifact.changeType === 'Novo' ? '+ ' : '';
            const formattedPath = `${prefix}${artifact.path}#${commitHash}`;
            vscode.env.clipboard.writeText(formattedPath);
            vscode.window.showInformationMessage('Link copiado: ' + formattedPath);
        }
    }

    // Copia todos os links de artefatos
    private copyAllArtifactsLinks() {
        const links = this.artifactsProvider.copyAllLinks();

        if (links.length === 0) {
            vscode.window.showErrorMessage('Não há artefatos para copiar.');
            return;
        }

        // Junta todos os links com quebras de linha
        const allLinks = links.join('\n');

        vscode.env.clipboard.writeText(allLinks);
        vscode.window.showInformationMessage(`${links.length} links copiados para a área de transferência`);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Valores iniciais dos filtros
        const taskIdFilter = this.historyProvider.currentTaskIdFilter || '';
        const authorFilter = this.historyProvider.currentAuthorFilter || '';

        // HTML para a webview
        return /*html*/`<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background: var(--vscode-panel-background);
                }
                .filter-container {
                    padding: 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-panel-background);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                .filter-group {
                    margin-bottom: 8px;
                }
                label {
                    display: block;
                    font-size: 11px;
                    margin-bottom: 2px;
                    color: var(--vscode-descriptionForeground);
                }
                .input-container {
                    position: relative;
                    display: flex;
                }
                input {
                    flex: 1;
                    padding: 4px 24px 4px 6px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 2px;
                    font-size: 12px;
                    line-height: 1.4;
                    height: 22px;
                }
                input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                .clear-button {
                    position: absolute;
                    right: 4px;
                    top: 50%;
                    transform: translateY(-50%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 16px;
                    height: 16px;
                    border: none;
                    background: none;
                    color: var(--vscode-input-placeholderForeground);
                    cursor: pointer;
                    font-size: 12px;
                    padding: 0;
                    opacity: 0.6;
                }
                .clear-button:hover {
                    opacity: 1;
                }
                .artifacts-list {
                    padding: 8px;
                }
                .artifact-item {
                    display: flex;
                    align-items: center;
                    padding: 4px 0;
                    font-size: 12px;
                    cursor: pointer;
                }
                .artifact-item:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .artifact-icon {
                    margin-right: 6px;
                    font-size: 14px;
                    min-width: 16px;
                    text-align: center;
                }
                .artifact-path {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .artifact-actions {
                    display: flex;
                    opacity: 0;
                }
                .artifact-item:hover .artifact-actions {
                    opacity: 1;
                }
                .action-button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 16px;
                    height: 16px;
                    border: none;
                    background: none;
                    color: var(--vscode-foreground);
                    cursor: pointer;
                    font-size: 14px;
                    padding: 0;
                    margin-left: 4px;
                    opacity: 0.8;
                }
                .action-button:hover {
                    opacity: 1;
                }
                .empty-state {
                    padding: 20px;
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                }
                .button-row {
                    display: flex;
                    margin-top: 8px;
                    gap: 6px;
                }
                .action-link {
                    background: none;
                    border: none;
                    color: var(--vscode-textLink-foreground);
                    cursor: pointer;
                    padding: 0;
                    font-size: 12px;
                    text-decoration: underline;
                }
                .action-link:hover {
                    color: var(--vscode-textLink-activeForeground);
                }
                .toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: 4px;
                }
                .toolbar-button {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 6px;
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 11px;
                }
                .toolbar-button:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                .toolbar-button:active {
                    background: var(--vscode-button-secondaryBackground);
                    opacity: 0.8;
                }
                .status-bar {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 4px;
                }
                .copy-all-btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .copy-all-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="filter-container">
                <div class="filter-group">
                    <label for="author">Identificação do Autor:</label>
                    <div class="input-container">
                        <input 
                            type="text" 
                            id="author" 
                            placeholder="Ex: c1234567"
                            value="${authorFilter}">
                        <button class="clear-button" id="clear-author" title="Limpar">✕</button>
                    </div>
                </div>
                
                <div class="filter-group">
                    <label for="taskId">Número da Tarefa (opcional):</label>
                    <div class="input-container">
                        <input 
                            type="text" 
                            id="taskId" 
                            placeholder="Ex: 123456, T-123, TASK-123"
                            value="${taskIdFilter}">
                        <button class="clear-button" id="clear-taskId" title="Limpar">✕</button>
                    </div>
                </div>
                
                <div class="toolbar">
                    <button id="apply-filters" class="toolbar-button">Aplicar Filtros</button>
                    <button id="clear-filters" class="toolbar-button">Limpar Filtros</button>
                    <button id="copy-all" class="toolbar-button copy-all-btn">Copiar Todos</button>
                </div>
            </div>
            
            <div id="artifacts-container">
                <div id="artifacts-list" class="artifacts-list"></div>
                <div id="empty-state" class="empty-state">
                    Nenhum artefato capturado. 
                    <div class="button-row">
                        <button class="action-link" id="capture-last">Capturar último commit</button>
                        <button class="action-link" id="capture-staged">Capturar staged</button>
                    </div>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // Elementos da interface
                    const authorInput = document.getElementById('author');
                    const taskIdInput = document.getElementById('taskId');
                    const clearAuthorBtn = document.getElementById('clear-author');
                    const clearTaskIdBtn = document.getElementById('clear-taskId');
                    const applyFiltersBtn = document.getElementById('apply-filters');
                    const clearFiltersBtn = document.getElementById('clear-filters');
                    const copyAllBtn = document.getElementById('copy-all');
                    const artifactsList = document.getElementById('artifacts-list');
                    const emptyState = document.getElementById('empty-state');
                    const captureLastBtn = document.getElementById('capture-last');
                    const captureStagedBtn = document.getElementById('capture-staged');
                    
                    let currentArtifacts = [];
                    let currentCommitHash = '';
                    
                    // Escuta de eventos
                    clearAuthorBtn.addEventListener('click', () => {
                        authorInput.value = '';
                        applyFilters();
                    });
                    
                    clearTaskIdBtn.addEventListener('click', () => {
                        taskIdInput.value = '';
                        applyFilters();
                    });
                    
                    applyFiltersBtn.addEventListener('click', applyFilters);
                    clearFiltersBtn.addEventListener('click', clearFilters);
                    copyAllBtn.addEventListener('click', copyAllArtifacts);
                    captureLastBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'executeCommand', command: 'manager-assistant.captureLastCommit' });
                    });
                    captureStagedBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'executeCommand', command: 'manager-assistant.captureStagedChanges' });
                    });
                    
                    // Auto-aplicar filtros ao digitar (com debounce)
                    let debounceTimer;
                    authorInput.addEventListener('input', () => {
                        clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(applyFilters, 500);
                    });
                    
                    taskIdInput.addEventListener('input', () => {
                        clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(applyFilters, 500);
                    });
                    
                    // Funções
                    function applyFilters() {
                        vscode.postMessage({
                            type: 'applyFilters',
                            author: authorInput.value,
                            taskId: taskIdInput.value
                        });
                    }
                    
                    function clearFilters() {
                        authorInput.value = '';
                        taskIdInput.value = '';
                        vscode.postMessage({
                            type: 'clearFilters'
                        });
                    }
                    
                    function copyArtifact(path) {
                        vscode.postMessage({
                            type: 'copyArtifact',
                            path: path,
                            commitHash: currentCommitHash
                        });
                    }
                    
                    function copyAllArtifacts() {
                        vscode.postMessage({
                            type: 'copyAllArtifacts'
                        });
                    }
                    
                    function renderArtifacts(artifacts, commitHash) {
                        currentArtifacts = artifacts;
                        currentCommitHash = commitHash;
                        
                        if (!artifacts || artifacts.length === 0) {
                            artifactsList.innerHTML = '';
                            emptyState.style.display = 'block';
                            return;
                        }
                        
                        emptyState.style.display = 'none';
                        artifactsList.innerHTML = '';
                        
                        artifacts.forEach(artifact => {
                            const item = document.createElement('div');
                            item.className = 'artifact-item';
                            
                            // Usar ícones simples, que funcionam em qualquer ambiente
                            let icon = '';
                            switch(artifact.changeType) {
                                case 'Novo':
                                    icon = '➕'; // Emoji de adicionar
                                    break;
                                case 'Atualização':
                                    icon = '✏️'; // Emoji de editar
                                    break;
                                case 'Remoção':
                                    icon = '🗑️'; // Emoji de lixeira
                                    break;
                                default:
                                    icon = '📄'; // Emoji de documento
                            }
                            
                            const displayPath = artifact.changeType === 'Novo' 
                                ? "+ " + artifact.path 
                                : artifact.path;
                            
                            item.innerHTML = \`
                                <span class="artifact-icon">\${icon}</span>
                                <span class="artifact-path">\${displayPath}</span>
                                <div class="artifact-actions">
                                    <button class="action-button copy-btn" title="Copiar link">📋</button>
                                </div>
                            \`;
                            
                            // Adicionar tooltips
                            item.title = \`\${artifact.path}#\${commitHash}
Tipo: \${artifact.type}
Alteração: \${artifact.changeType}
Complexidade: \${artifact.complexity}\`;
                            
                            if (artifact.author) {
                                item.title += \`\\nAutor: \${artifact.author}\`;
                            }
                            if (artifact.taskId) {
                                item.title += \`\\nTarefa: \${artifact.taskId}\`;
                            }
                            
                            // Eventos
                            const copyBtn = item.querySelector('.copy-btn');
                            copyBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                copyArtifact(artifact.path);
                            });
                            
                            artifactsList.appendChild(item);
                        });
                        
                        // Atualizar status
                        updateStatus(artifacts.length);
                    }
                    
                    function updateStatus(count) {
                        // Aqui poderia adicionar um elemento de status
                        copyAllBtn.textContent = \`Copiar Todos (\${count})\`;
                    }
                    
                    // Escutar mensagens da extensão
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.type) {
                            case 'updateArtifacts':
                                renderArtifacts(message.artifacts, message.commitHash);
                                break;
                            case 'updateFilters':
                                authorInput.value = message.author || '';
                                taskIdInput.value = message.taskId || '';
                                break;
                        }
                    });
                    
                    // Solicitar artefatos ao carregar
                    vscode.postMessage({
                        type: 'getArtifacts'
                    });
                }());
            </script>
        </body>
        </html>`;
    }
}