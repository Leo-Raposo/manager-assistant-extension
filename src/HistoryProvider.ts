import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Classe para representar um relatório no histórico
class ReportItem extends vscode.TreeItem {
    constructor(
        public readonly report: HistoryReport
    ) {
        super(report.name);

        this.description = `${report.artifactCount} artefatos`;
        this.tooltip = `Commit: ${report.commitHash}\nData: ${new Date(report.timestamp || '').toLocaleString()}\nArtefatos: ${report.artifactCount}`;
        this.contextValue = 'report';
        this.iconPath = new vscode.ThemeIcon('history');
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;

        // Adicionar comando ao clicar no item para carregar os artefatos do relatório
        this.command = {
            command: 'manager-assistant.loadReport',
            title: 'Carregar Relatório',
            arguments: [this]
        };
    }
}

// Interface para os relatórios
interface HistoryReport {
    id: string;
    name: string;
    artifactCount: number;
    commitHash: string;
    artifacts: any[];
    timestamp?: string;
}

// Classe para o TreeDataProvider do Histórico de Relatórios
export class HistoryProvider implements vscode.TreeDataProvider<ReportItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ReportItem | undefined | null | void> = new vscode.EventEmitter<ReportItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ReportItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private history: HistoryReport[] = [];
    private taskIdFilter: string = '';
    private authorFilter: string = '';

    constructor(private readonly artifactsProvider: any) {
        // Carrega o histórico salvo
        this.loadHistory();

        // Carrega filtros salvos
        this.loadFilters();
    }

    loadFilters(): void {
        const storageFile = path.join(this.getStoragePath(), 'filters.json');

        if (fs.existsSync(storageFile)) {
            try {
                const filters = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
                this.taskIdFilter = filters.taskId || '';
                this.authorFilter = filters.author || '';
            } catch (error) {
                console.error('Erro ao carregar filtros:', error);
            }
        }
    }

    saveFilters(): void {
        const storageFile = path.join(this.getStoragePath(), 'filters.json');
        const storageDir = path.dirname(storageFile);

        // Garante que o diretório existe
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        try {
            fs.writeFileSync(storageFile, JSON.stringify({
                taskId: this.taskIdFilter,
                author: this.authorFilter
            }, null, 2));
        } catch (error) {
            console.error('Erro ao salvar filtros:', error);
        }
    }

    private getStoragePath(): string {
        // Usa o contexto global para armazenamento persistente entre sessões do VS Code
        const workspaceState = vscode.workspace.workspaceFolders;
        if (workspaceState && workspaceState.length > 0) {
            return path.join(workspaceState[0].uri.fsPath, '.vscode', 'manager-assistant');
        }
        return path.join(require('os').homedir(), '.manager-assistant');
    }

    // Setters para os filtros
    setTaskIdFilter(taskId: string): void {
        this.taskIdFilter = taskId;
        this.saveFilters();
        this.refresh(); // Recarregar com o novo filtro
    }

    setAuthorFilter(author: string): void {
        this.authorFilter = author;
        this.saveFilters();
        this.refresh(); // Recarregar com o novo filtro
    }

    // Getters para os filtros
    get currentTaskIdFilter(): string {
        return this.taskIdFilter;
    }

    get currentAuthorFilter(): string {
        return this.authorFilter;
    }

    loadHistory(): void {
        const storageFile = path.join(this.getStoragePath(), 'report-history.json');

        if (fs.existsSync(storageFile)) {
            try {
                this.history = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
                this._onDidChangeTreeData.fire();
            } catch (error) {
                console.error('Erro ao carregar histórico:', error);
                this.history = [];
            }
        }
    }

    saveHistory(): void {
        const storageFile = path.join(this.getStoragePath(), 'report-history.json');
        const storageDir = path.dirname(storageFile);

        // Garante que o diretório existe
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        // Limita o histórico ao tamanho configurado
        const historyLimit = vscode.workspace.getConfiguration('managerAssistant').get('reportHistoryLimit', 10);
        if (this.history.length > historyLimit) {
            this.history = this.history.slice(0, historyLimit);
        }

        try {
            fs.writeFileSync(storageFile, JSON.stringify(this.history, null, 2));
        } catch (error) {
            console.error('Erro ao salvar histórico:', error);
            vscode.window.showErrorMessage('Erro ao salvar histórico: ' + (error as Error).message);
        }
    }

    addReport(report: any): void {
        const timestamp = new Date().toISOString();
        const reportName = `Relatório ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

        this.history.unshift({
            id: timestamp,
            name: reportName,
            timestamp: timestamp,
            commitHash: report.commitHash,
            artifactCount: report.artifacts.length,
            artifacts: report.artifacts
        });

        this.saveHistory();
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this.loadHistory();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ReportItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ReportItem): Thenable<ReportItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        // Aplica filtros se necessário
        let filteredHistory = [...this.history];

        // Aqui poderíamos aplicar filtros adicionais para o histórico
        // por enquanto vamos apenas retornar todos os relatórios

        return Promise.resolve(
            filteredHistory.map(report => new ReportItem(report))
        );
    }
}