import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Classe para o painel de filtros personalizado dentro da extensão
export class FilterPanel {
    public static currentPanel: FilterPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionPath: string,
        private readonly historyProvider: any,
        private readonly artifactsProvider: any
    ) {
        this._panel = panel;

        // Carrega os valores iniciais dos filtros
        const taskIdFilter = this.historyProvider.currentTaskIdFilter || '';
        const authorFilter = this.historyProvider.currentAuthorFilter || '';

        // Configura o HTML inicial
        this._panel.webview.html = this._getWebviewContent(taskIdFilter, authorFilter);

        // Escuta eventos da webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'applyFilters':
                        this.historyProvider.setTaskIdFilter(message.taskId);
                        this.historyProvider.setAuthorFilter(message.author);
                        this.historyProvider.refresh();
                        vscode.window.showInformationMessage('Filtros aplicados com sucesso');
                        this._panel.dispose();
                        return;
                    case 'clearFilters':
                        this.historyProvider.setTaskIdFilter('');
                        this.historyProvider.setAuthorFilter('');
                        this.historyProvider.refresh();
                        vscode.window.showInformationMessage('Filtros limpos com sucesso');
                        this._panel.dispose();
                        return;
                    case 'cancel':
                        this._panel.dispose();
                        return;
                }
            },
            null,
            this._disposables
        );

        // Escuta quando o painel é fechado
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    // Criar novo painel de filtros
    public static createOrShow(
        extensionPath: string,
        historyProvider: any,
        artifactsProvider: any
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Se já existe um painel, mostra-o
        if (FilterPanel.currentPanel) {
            FilterPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Caso contrário, cria um novo painel
        const panel = vscode.window.createWebviewPanel(
            'managerAssistantFilters',
            'Filtros do Manager Assistant',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(extensionPath, 'media'))
                ]
            }
        );

        FilterPanel.currentPanel = new FilterPanel(panel, extensionPath, historyProvider, artifactsProvider);
    }

    // Limpa recursos
    public dispose() {
        FilterPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    // Conteúdo HTML do painel
    private _getWebviewContent(taskIdFilter: string, authorFilter: string) {
        return `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Filtros do Manager Assistant</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 3px;
                }
                .form-actions {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 20px;
                }
                button {
                    padding: 8px 12px;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                button.secondary {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .input-with-clear {
                    position: relative;
                }
                .clear-button {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    padding: 0;
                    color: var(--vscode-input-placeholderForeground);
                    cursor: pointer;
                    font-size: 14px;
                }
                .clear-button:hover {
                    color: var(--vscode-input-foreground);
                }
            </style>
        </head>
        <body>
            <h2>Filtros do Manager Assistant</h2>
            <form id="filter-form">
                <div class="form-group">
                    <label for="taskId">Número da Tarefa (opcional):</label>
                    <div class="input-with-clear">
                        <input type="text" id="taskId" name="taskId" placeholder="Ex: 123456, T-123, TASK-123" value="${taskIdFilter}">
                        <button type="button" class="clear-button" id="clear-task" title="Limpar campo">✕</button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="author">Identificação do Autor:</label>
                    <div class="input-with-clear">
                        <input type="text" id="author" name="author" placeholder="Ex: c1234567" value="${authorFilter}">
                        <button type="button" class="clear-button" id="clear-author" title="Limpar campo">✕</button>
                    </div>
                </div>
                
                <div class="form-actions">
                    <div>
                        <button type="button" id="apply-filters">Aplicar Filtros</button>
                        <button type="button" id="clear-filters" class="secondary">Limpar Todos</button>
                    </div>
                    <button type="button" id="cancel" class="secondary">Cancelar</button>
                </div>
            </form>
            
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // Botões de limpar campo individual
                    document.getElementById('clear-task').addEventListener('click', () => {
                        document.getElementById('taskId').value = '';
                    });
                    
                    document.getElementById('clear-author').addEventListener('click', () => {
                        document.getElementById('author').value = '';
                    });
                    
                    // Botão de aplicar filtros
                    document.getElementById('apply-filters').addEventListener('click', () => {
                        const taskId = document.getElementById('taskId').value;
                        const author = document.getElementById('author').value;
                        
                        vscode.postMessage({
                            command: 'applyFilters',
                            taskId: taskId,
                            author: author
                        });
                    });
                    
                    // Botão de limpar todos os filtros
                    document.getElementById('clear-filters').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'clearFilters'
                        });
                    });
                    
                    // Botão de cancelar
                    document.getElementById('cancel').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'cancel'
                        });
                    });
                    
                    // Permitir submit com Enter no formulário
                    document.getElementById('filter-form').addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            document.getElementById('apply-filters').click();
                        }
                    });
                }());
            </script>
        </body>
        </html>`;
    }
}