import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Interfaces
interface Artifact {
	path: string;
	type: string;
	changeType: ChangeType;
	complexity: Complexity;
}

interface Report {
	commitHash: string;
	artifacts: Artifact[];
	timestamp?: string;
}

interface HistoryReport extends Report {
	id: string;
	name: string;
	artifactCount: number;
}

// Enums
enum ChangeType {
	New = 'Novo',
	Update = 'Atualização',
	Delete = 'Remoção',
	Rename = 'Renomeado',
	Other = 'Outro'
}

enum Complexity {
	Low = 'Baixa',
	Medium = 'Média',
	High = 'Alta',
	NA = 'N/A'
}

// Classes para itens da TreeView
class ArtifactItem extends vscode.TreeItem {
	constructor(
		public readonly artifact: Artifact,
		public readonly commitHash: string
	) {
		super(artifact.path);

		this.description = artifact.type;
		this.tooltip = `${artifact.path}#${commitHash}\nTipo: ${artifact.type}\nAlteração: ${artifact.changeType}\nComplexidade: ${artifact.complexity}`;
		this.contextValue = 'artifact';

		// Ícone baseado no tipo de alteração
		switch (artifact.changeType) {
			case ChangeType.New:
				this.iconPath = new vscode.ThemeIcon('add');
				break;
			case ChangeType.Update:
				this.iconPath = new vscode.ThemeIcon('edit');
				break;
			case ChangeType.Delete:
				this.iconPath = new vscode.ThemeIcon('trash');
				break;
			default:
				this.iconPath = new vscode.ThemeIcon('file');
		}
	}
}

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
	}
}

// Classe para o TreeDataProvider dos Artefatos
class ArtifactsProvider implements vscode.TreeDataProvider<ArtifactItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ArtifactItem | undefined | null | void> = new vscode.EventEmitter<ArtifactItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ArtifactItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private _artifacts: Artifact[] = [];
	private _commitHash: string = '';
	private statusBarItem: vscode.StatusBarItem;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.statusBarItem.text = "$(git-commit) Manager Assistant";
		this.statusBarItem.command = "manager-assistant.captureLastCommit";
		this.statusBarItem.tooltip = "Capturar commits para o Manager";
		this.statusBarItem.show();
	}

	// Método público para disposição
	public disposeStatusBarItem(): void {
		this.statusBarItem.dispose();
	}

	refresh(newArtifacts?: Artifact[], commitHash?: string): void {
		this._artifacts = newArtifacts || [];
		this._commitHash = commitHash || '';
		this._onDidChangeTreeData.fire();
		this.updateStatus();
	}

	private updateStatus(): void {
		if (this._artifacts.length > 0) {
			this.statusBarItem.text = `$(check) Manager: ${this._artifacts.length} artefatos`;
			this.statusBarItem.tooltip = `${this._artifacts.length} artefatos prontos para envio`;
		} else {
			this.statusBarItem.text = "$(git-commit) Manager Assistant";
			this.statusBarItem.tooltip = "Capturar commits para o Manager";
		}
	}

	getTreeItem(element: ArtifactItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ArtifactItem): Thenable<ArtifactItem[]> {
		if (element) {
			return Promise.resolve([]);
		}

		if (this._artifacts.length === 0) {
			return Promise.resolve([]);
		}

		return Promise.resolve(
			this._artifacts.map(artifact => new ArtifactItem(artifact, this._commitHash))
		);
	}

	// Getter para expor os artefatos
	get artifacts(): Artifact[] {
		return this._artifacts;
	}

	// Getter para expor o commitHash
	get commitHash(): string {
		return this._commitHash;
	}

	dispose(): void {
		this.statusBarItem.dispose();
	}
}

// Classe para o TreeDataProvider do Histórico
class HistoryProvider implements vscode.TreeDataProvider<ReportItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ReportItem | undefined | null | void> = new vscode.EventEmitter<ReportItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ReportItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private history: HistoryReport[] = [];

	constructor() {
		// Carrega o histórico salvo
		this.loadHistory();
	}

	loadHistory(): void {
		const storageFile = path.join(getStoragePath(), 'report-history.json');

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
		const storageFile = path.join(getStoragePath(), 'report-history.json');
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

	addReport(report: Report): void {
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
	}

	getTreeItem(element: ReportItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ReportItem): Thenable<ReportItem[]> {
		if (element) {
			return Promise.resolve([]);
		}

		if (this.history.length === 0) {
			return Promise.resolve([]);
		}

		return Promise.resolve(
			this.history.map(report => new ReportItem(report))
		);
	}
}

// Funções utilitárias
function getStoragePath(): string {
	// Usa o contexto global para armazenamento persistente entre sessões do VS Code
	const workspaceState = vscode.workspace.workspaceFolders;
	if (workspaceState && workspaceState.length > 0) {
		return path.join(workspaceState[0].uri.fsPath, '.vscode', 'manager-assistant');
	}
	return path.join(os.homedir(), '.manager-assistant');
}

function detectFileType(filePath: string): string {
	const extension = path.extname(filePath).toLowerCase();

	const typeMap: Record<string, string> = {
		'.ts': 'TypeScript',
		'.js': 'JavaScript',
		'.html': 'HTML',
		'.css': 'CSS',
		'.scss': 'SCSS',
		'.java': 'Java',
		'.php': 'PHP',
		'.json': 'JSON',
		'.xml': 'XML',
		'.md': 'Markdown'
	};

	return typeMap[extension] || 'Outro';
}

function detectComplexity(filePath: string): Complexity {
	const extension = path.extname(filePath).toLowerCase();

	if (['.ts', '.js', '.java'].includes(extension)) {
		return Complexity.Medium;
	} else if (['.html', '.css', '.scss'].includes(extension)) {
		return Complexity.Low;
	} else {
		return Complexity.NA;
	}
}

function parseGitChanges(gitOutput: string): Artifact[] {
	if (!gitOutput.trim()) {
		return [];
	}

	const lines = gitOutput.trim().split('\n');
	const artifacts: Artifact[] = [];

	lines.forEach(line => {
		if (!line.trim()) {
			return;
		}

		const parts = line.trim().split(/\s+/);
		const status = parts[0];
		const filePath = parts.slice(1).join(' '); // Para lidar com espaços no caminho

		let changeType: ChangeType;

		switch (status) {
			case 'A':
				changeType = ChangeType.New;
				break;
			case 'M':
				changeType = ChangeType.Update;
				break;
			case 'D':
				changeType = ChangeType.Delete;
				break;
			case 'R':
				changeType = ChangeType.Rename;
				break;
			default:
				changeType = ChangeType.Other;
		}

		artifacts.push({
			path: filePath,
			type: detectFileType(filePath),
			changeType: changeType,
			complexity: detectComplexity(filePath)
		});
	});

	return artifacts;
}

// Função principal para ativação da extensão
export function activate(context: vscode.ExtensionContext) {
	console.log('Manager Assistant está ativo!');

	// Cria os provedores de dados
	const artifactsProvider = new ArtifactsProvider();
	const historyProvider = new HistoryProvider();

	// Registra as views
	vscode.window.registerTreeDataProvider('managerAssistantExplorer', artifactsProvider);
	vscode.window.registerTreeDataProvider('managerAssistantHistory', historyProvider);

	// Comando para capturar o último commit
	let captureLastCommitCommand = vscode.commands.registerCommand('manager-assistant.captureLastCommit', async () => {
		try {
			if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
				throw new Error('Nenhum workspace aberto. Abra um projeto Git para usar esta extensão.');
			}

			const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

			// Mostra indicador de progresso
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Manager Assistant",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Capturando último commit..." });

				// Obtém a hash do último commit
				const { stdout: commitHash } = await execPromise('git rev-parse HEAD', { cwd: rootPath });
				const shortHash = commitHash.trim().substring(0, 10);

				progress.report({ message: "Analisando arquivos alterados..." });

				// Obtém os arquivos alterados no último commit
				const { stdout: gitOutput } = await execPromise('git diff-tree --no-commit-id --name-status -r HEAD', { cwd: rootPath });

				// Processa os arquivos
				const artifacts = parseGitChanges(gitOutput);

				// Atualiza a view
				artifactsProvider.refresh(artifacts, shortHash);

				progress.report({ message: `Encontrados ${artifacts.length} artefatos` });

				// Adiciona ao histórico
				historyProvider.addReport({
					commitHash: shortHash,
					artifacts: artifacts
				});

				return new Promise(resolve => setTimeout(resolve, 1000));
			});

			// Foca na view
			vscode.commands.executeCommand('managerAssistantExplorer.focus');

		} catch (error) {
			vscode.window.showErrorMessage('Erro ao capturar commit: ' + (error as Error).message);
		}
	});

	// Comando para capturar alterações staged
	let captureStagedChangesCommand = vscode.commands.registerCommand('manager-assistant.captureStagedChanges', async () => {
		try {
			if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
				throw new Error('Nenhum workspace aberto. Abra um projeto Git para usar esta extensão.');
			}

			const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Manager Assistant",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Capturando alterações staged..." });

				// Obtém os arquivos staged
				const { stdout: gitOutput } = await execPromise('git diff --name-status --staged', { cwd: rootPath });

				// Se não houver alterações staged
				if (!gitOutput.trim()) {
					throw new Error('Não há alterações staged para capturar.');
				}

				// Processa os arquivos
				const artifacts = parseGitChanges(gitOutput);

				// Solicita hash (opcional)
				const inputHash = await vscode.window.showInputBox({
					prompt: 'Informe a hash do commit (opcional - será preenchida após o commit)',
					placeHolder: 'Deixe vazio para gerar depois do commit'
				});

				const hashToUse = inputHash ? inputHash.substring(0, 10) : 'hash_temp';

				// Atualiza a view
				artifactsProvider.refresh(artifacts, hashToUse);

				progress.report({ message: `Encontrados ${artifacts.length} artefatos` });

				// Adiciona ao histórico
				historyProvider.addReport({
					commitHash: hashToUse,
					artifacts: artifacts
				});

				return new Promise(resolve => setTimeout(resolve, 1000));
			});

			// Foca na view
			vscode.commands.executeCommand('managerAssistantExplorer.focus');

		} catch (error) {
			vscode.window.showErrorMessage('Erro ao capturar alterações staged: ' + (error as Error).message);
		}
	});

	// Comando para atualizar commits
	let refreshCommitsCommand = vscode.commands.registerCommand('manager-assistant.refreshCommits', () => {
		artifactsProvider.refresh();
		historyProvider.refresh();
	});

	// Comando para enviar para o Manager
	let sendToManagerCommand = vscode.commands.registerCommand('manager-assistant.sendToManager', (item: ArtifactItem) => {
		if (!item || !item.artifact) {
			vscode.window.showErrorMessage('Nenhum artefato selecionado.');
			return;
		}

		const artifact = item.artifact;
		const formattedPath = `${artifact.path}#${item.commitHash}`;

		// Verifica se há um endpoint configurado
		const apiEndpoint = vscode.workspace.getConfiguration('managerAssistant').get('apiEndpoint', '');

		if (apiEndpoint) {
			// Aqui implementaríamos a integração com a API do Manager
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Manager Assistant",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Enviando artefato para o Manager..." });

				// Simulação de envio
				await new Promise(resolve => setTimeout(resolve, 1500));

				vscode.window.showInformationMessage(`Artefato enviado para o Manager: ${formattedPath}`);
				return;
			});
		} else {
			// Se não houver API configurada, copia para a área de transferência
			vscode.env.clipboard.writeText(formattedPath);
			vscode.window.showInformationMessage('Link copiado: ' + formattedPath);
		}
	});

	// Comando para editar artefato
	let editArtifactCommand = vscode.commands.registerCommand('manager-assistant.editArtifact', async (item: ArtifactItem) => {
		if (!item || !item.artifact) {
			vscode.window.showErrorMessage('Nenhum artefato selecionado.');
			return;
		}

		const artifact = item.artifact;

		// Opções de complexidade
		const complexityOptions = [Complexity.Low, Complexity.Medium, Complexity.High, Complexity.NA];

		// Solicita nova complexidade
		const newComplexity = await vscode.window.showQuickPick(complexityOptions, {
			placeHolder: 'Selecione a complexidade',
			title: 'Editar Artefato'
		});

		if (newComplexity) {
			artifact.complexity = newComplexity as Complexity;
			artifactsProvider.refresh(artifactsProvider.artifacts, artifactsProvider.commitHash);
			vscode.window.showInformationMessage(`Complexidade atualizada para: ${newComplexity}`);
		}
	});

	// Comando para copiar artefato
	let copyArtifactCommand = vscode.commands.registerCommand('manager-assistant.copyArtifact', (item: ArtifactItem) => {
		if (!item || !item.artifact) {
			vscode.window.showErrorMessage('Nenhum artefato selecionado.');
			return;
		}

		const artifact = item.artifact;
		const formattedPath = `${artifact.path}#${item.commitHash}`;

		vscode.env.clipboard.writeText(formattedPath);
		vscode.window.showInformationMessage('Link copiado: ' + formattedPath);
	});

	// Comando para remover artefato
	let removeArtifactCommand = vscode.commands.registerCommand('manager-assistant.removeArtifact', (item: ArtifactItem) => {
		if (!item || !item.artifact) {
			vscode.window.showErrorMessage('Nenhum artefato selecionado.');
			return;
		}

		const artifactPath = item.artifact.path;

		// Filtra o artefato da lista
		const updatedArtifacts = artifactsProvider.artifacts.filter(a => a.path !== artifactPath);
		artifactsProvider.refresh(updatedArtifacts, artifactsProvider.commitHash);

		vscode.window.showInformationMessage(`Artefato removido: ${artifactPath}`);
	});

	// Comando para salvar relatório
	let saveReportCommand = vscode.commands.registerCommand('manager-assistant.saveReport', async () => {
		if (!artifactsProvider.artifacts || artifactsProvider.artifacts.length === 0) {
			vscode.window.showErrorMessage('Não há artefatos para salvar.');
			return;
		}

		const reportData = {
			timestamp: new Date().toISOString(),
			commitHash: artifactsProvider.commitHash,
			artifacts: artifactsProvider.artifacts
		};

		// Solicita local para salvar
		const saveUri = await vscode.window.showSaveDialog({
			defaultUri: vscode.Uri.file('manager-report.json'),
			filters: { 'JSON': ['json'] }
		});

		if (saveUri) {
			try {
				fs.writeFileSync(saveUri.fsPath, JSON.stringify(reportData, null, 2));
				vscode.window.showInformationMessage('Relatório salvo com sucesso!');
			} catch (error) {
				vscode.window.showErrorMessage('Erro ao salvar relatório: ' + (error as Error).message);
			}
		}
	});

	// Comando para carregar relatório
	let loadReportCommand = vscode.commands.registerCommand('manager-assistant.loadReport', async (item?: ReportItem) => {
		// Se foi chamado a partir de um item do histórico
		if (item && item.report) {
			artifactsProvider.refresh(item.report.artifacts, item.report.commitHash);
			vscode.commands.executeCommand('managerAssistantExplorer.focus');
			return;
		}

		// Caso contrário, solicita arquivo para carregar
		const openUri = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: { 'JSON': ['json'] }
		});

		if (openUri && openUri.length > 0) {
			try {
				const fileContent = fs.readFileSync(openUri[0].fsPath, 'utf8');
				const reportData = JSON.parse(fileContent);

				if (reportData.artifacts && reportData.commitHash) {
					artifactsProvider.refresh(reportData.artifacts, reportData.commitHash);
					vscode.window.showInformationMessage('Relatório carregado com sucesso!');
					vscode.commands.executeCommand('managerAssistantExplorer.focus');
				} else {
					throw new Error('Formato de arquivo inválido.');
				}
			} catch (error) {
				vscode.window.showErrorMessage('Erro ao carregar relatório: ' + (error as Error).message);
			}
		}
	});

	// Registra todos os comandos no contexto da extensão
	context.subscriptions.push(
		captureLastCommitCommand,
		captureStagedChangesCommand,
		refreshCommitsCommand,
		sendToManagerCommand,
		editArtifactCommand,
		copyArtifactCommand,
		removeArtifactCommand,
		saveReportCommand,
		loadReportCommand
	);

	// Registra a disposição da barra de status
	context.subscriptions.push({ dispose: () => artifactsProvider.disposeStatusBarItem() });
}

// Função de desativação da extensão
export function deactivate() {
	// Nada específico a fazer na desativação
}