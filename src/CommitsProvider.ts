import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as simplegit from 'simple-git';

const execPromise = promisify(exec);
const simpleGit = simplegit.simpleGit;

// Classe para representar um commit do Git
class CommitItem extends vscode.TreeItem {
    constructor(
        public readonly id: string,
        public readonly message: string,
        public readonly date: Date,
        public readonly author: string,
        public readonly taskId?: string
    ) {
        // Se tiver taskId, destaque no início da mensagem
        const displayMessage = taskId ? `[${taskId}] ${message}` : message;
        super(displayMessage);

        this.description = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        this.tooltip = `ID: ${id}\nAutor: ${author}\nData: ${date.toLocaleString()}\nMensagem: ${message}` +
            (taskId ? `\nTarefa: ${taskId}` : '');
        this.contextValue = 'commit';
        this.iconPath = new vscode.ThemeIcon('git-commit');
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;

        // Adicionar comando ao clicar no item
        this.command = {
            command: 'manager-assistant.loadCommitArtifacts',
            title: 'Carregar Artefatos',
            arguments: [this]
        };
    }
}

// Classe para o TreeDataProvider dos Commits Git
export class CommitsProvider implements vscode.TreeDataProvider<CommitItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommitItem | undefined | null | void> = new vscode.EventEmitter<CommitItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommitItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private commits: CommitItem[] = [];
    private taskIdFilter: string = '';
    private authorFilter: string = '';

    constructor(private readonly artifactsProvider: any) {
        // Carrega commits do Git
        this.loadGitCommits();

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
        this.loadGitCommits(); // Recarregar com o novo filtro
    }

    setAuthorFilter(author: string): void {
        this.authorFilter = author;
        this.saveFilters();
        this.loadGitCommits(); // Recarregar com o novo filtro
    }

    // Getters para os filtros
    get currentTaskIdFilter(): string {
        return this.taskIdFilter;
    }

    get currentAuthorFilter(): string {
        return this.authorFilter;
    }

    // Regex para extrair taskId da mensagem de commit
    extractTaskId(message: string): string | undefined {
        // Padrão comum: TASK-123, task#123, task-123, etc.
        const patterns = [
            /\b[Tt][Aa][Ss][Kk][-#](\d+)\b/,
            /\b[Tt][-#](\d+)\b/,
            /\b#(\d+)\b/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return undefined;
    }

    // Extrai a identificação BB (c1234567) da string do autor
    extractBBIdentification(author: string): string | undefined {
        // Padrão típico de identificação do BB: c1234567
        const match = author.match(/\bc\d{7}\b/i);
        return match ? match[0] : undefined;
    }

    async loadGitCommits(): Promise<void> {
        try {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                return;
            }

            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const git = simpleGit(rootPath);

            // Obter os últimos 20 commits
            const logOptions = [
                '-n', '20',
                '--pretty=format:%H|%an|%ae|%at|%s'
            ];

            const log = await git.log(logOptions);
            this.commits = [];

            for (const commit of log.all) {
                const commitParts = commit.hash.split('|');
                if (commitParts.length < 5) { continue; }

                const [id, authorName, authorEmail, timestamp, ...messageParts] = commitParts;
                const message = messageParts.join('|'); // Em caso de | na mensagem
                const date = new Date(parseInt(timestamp) * 1000);

                // Extrai a taskId da mensagem
                const taskId = this.extractTaskId(message);

                // Extrai a identificação BB do autor
                const author = `${authorName} <${authorEmail}>`;
                const bbId = this.extractBBIdentification(author);

                // Aplica filtros
                if (this.taskIdFilter && (!taskId || !taskId.includes(this.taskIdFilter))) {
                    continue;
                }

                if (this.authorFilter && (!bbId || !author.toLowerCase().includes(this.authorFilter.toLowerCase()))) {
                    continue;
                }

                this.commits.push(new CommitItem(id, message, date, author, taskId));
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Erro ao carregar commits do Git:', error);
            vscode.window.showErrorMessage('Erro ao carregar commits: ' + (error as Error).message);
        }
    }

    refresh(): void {
        this.loadGitCommits();
    }

    getTreeItem(element: CommitItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CommitItem): Thenable<CommitItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        return Promise.resolve(this.commits);
    }
}