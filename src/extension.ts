import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { FilterPanel } from './FilterPanel';
import { ArtifactsWebviewProvider } from './ArtifactsWebviewProvider';
import { CommitsProvider } from './CommitsProvider';
import { HistoryProvider } from './HistoryProvider';

import * as simplegit from 'simple-git';
type SimpleGit = simplegit.SimpleGit;
const simpleGit = simplegit.simpleGit;

// Interfaces
interface Artifact {
	path: string;
	type: string;
	changeType: ChangeType;
	complexity: Complexity;
	author?: string;
	taskId?: string;
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
		// Adiciona o símbolo '+' na frente do path para artefatos novos
		const displayName = artifact.changeType === ChangeType.New
			? `+ ${artifact.path}`
			: artifact.path;

		super(displayName);

		this.description = artifact.type;
		this.tooltip = `${artifact.path}#${commitHash}\nTipo: ${artifact.type}\nAlteração: ${artifact.changeType}\nComplexidade: ${artifact.complexity}` +
			(artifact.author ? `\nAutor: ${artifact.author}` : '') +
			(artifact.taskId ? `\nTarefa: ${artifact.taskId}` : '');
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

// Classe para o TreeDataProvider dos Artefatos
class ArtifactsProvider implements vscode.TreeDataProvider<ArtifactItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ArtifactItem | undefined | null | void> = new vscode.EventEmitter<ArtifactItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ArtifactItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private _artifacts: Artifact[] = [];
	private _commitHash: string = '';
	private statusBarItem: vscode.StatusBarItem;

	constructor() {
		// Cria apenas a barra de status principal
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

	// Método para filtrar artefatos
	filterArtifacts(taskId?: string, author?: string): void {
		const currentArtifacts = [...this._artifacts];
		let filteredArtifacts = currentArtifacts;

		// Filtrar por taskId se fornecido
		if (taskId && taskId.trim() !== '') {
			filteredArtifacts = filteredArtifacts.filter(artifact =>
				artifact.taskId && artifact.taskId.includes(taskId.trim())
			);
		}

		// Filtrar por autor se fornecido
		if (author && author.trim() !== '') {
			filteredArtifacts = filteredArtifacts.filter(artifact =>
				artifact.author && artifact.author.toLowerCase().includes(author.trim().toLowerCase())
			);
		}

		// Atualizar a visualização com os artefatos filtrados
		this._artifacts = filteredArtifacts;
		this._onDidChangeTreeData.fire();
	}

	// Método para copiar todos os links
	copyAllLinks(): string[] {
		return this._artifacts.map(artifact => {
			const prefix = artifact.changeType === ChangeType.New ? '+ ' : '';
			return `${prefix}${artifact.path}#${this._commitHash}`;
		});
	}

	dispose(): void {
		this.statusBarItem.dispose();
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

// Usando simple-git para operações Git
async function parseGitChangesWithSimpleGit(git: SimpleGit, commitHash: string): Promise<Artifact[]> {
	try {
		// Obter detalhes do commit
		const show = await git.show([
			commitHash,
			'--name-status',
			'--pretty=format:%an|%ae'
		]);

		if (!show) {
			return [];
		}

		// Separar o cabeçalho (autor) do conteúdo
		const lines = show.split('\n');
		let authorLine = '';
		let contentStartIndex = 0;

		// Encontrar a linha de autor e o início do conteúdo
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes('|')) {
				authorLine = lines[i];
				contentStartIndex = i + 1;
				break;
			}
		}

		// Extrair autor
		const authorParts = authorLine.split('|');
		const author = authorParts.length >= 2
			? `${authorParts[0]} <${authorParts[1]}>`
			: authorLine;

		// Extrair identificação BB
		const bbId = /\bc\d{7}\b/i.exec(author)?.[0];

		// Obter mensagem do commit para extrair taskId
		const logResult = await git.log(['-n', '1', commitHash]);
		const commitMessage = logResult.latest?.message || '';
		const taskId = extractTaskIdFromMessage(commitMessage);

		// Processar arquivos alterados
		const artifacts: Artifact[] = [];

		for (let i = contentStartIndex; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) { continue; }

			const parts = line.split(/\s+/);
			if (parts.length < 2) { continue; }

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
				complexity: detectComplexity(filePath),
				author: author,
				taskId: taskId
			});
		}

		return artifacts;
	} catch (error) {
		console.error('Erro ao processar alterações do Git:', error);
		throw error;
	}
}

// Extrai o ID da tarefa da mensagem do commit
function extractTaskIdFromMessage(message: string): string | undefined {
	// Padrões comuns para ID de tarefa
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

// Comando para mostrar a interface de filtros
async function showFilters(
	context: vscode.ExtensionContext,
	historyProvider: HistoryProvider,
	artifactsProvider: ArtifactsProvider
): Promise<void> {
	// Usa o novo painel de filtros em vez de InputBox
	FilterPanel.createOrShow(context.extensionPath, historyProvider, artifactsProvider);
}

// Função principal para ativação da extensão
export async function activate(context: vscode.ExtensionContext) {
	console.log('Manager Assistant está ativo!');

	// Cria os provedores de dados
	const artifactsProvider = new ArtifactsProvider();
	const historyProvider = new HistoryProvider(artifactsProvider);
	const commitsProvider = new CommitsProvider(artifactsProvider);

	// Cria e registra o provedor de webview personalizado para os artefatos
	const artifactsWebviewProvider = new ArtifactsWebviewProvider(
		context.extensionUri,
		artifactsProvider,
		historyProvider
	);

	// Registra o provedor de webview para a visualização de artefatos
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			ArtifactsWebviewProvider.viewType,
			artifactsWebviewProvider
		)
	);

	// Registra as views
	vscode.window.registerTreeDataProvider('managerAssistantCommits', commitsProvider);
	vscode.window.registerTreeDataProvider('managerAssistantHistory', historyProvider);

	// Assinatura para atualizar a webview quando os artefatos mudarem
	artifactsProvider.onDidChangeTreeData(() => {
		artifactsWebviewProvider.updateArtifactsList();
	});

	// Configurar o estado inicial das views (Histórico minimizado)
	setTimeout(() => {
		vscode.commands.executeCommand('managerAssistantHistory.collapse');
	}, 1000);

	// Comando para mostrar filtros
	let showFiltersCommand = vscode.commands.registerCommand('manager-assistant.showFilters', () => {
		// Foca na view de artefatos que já tem os filtros integrados
		vscode.commands.executeCommand('managerAssistantExplorer.focus');
	});

	// Comando para capturar o último commit
	let captureLastCommitCommand = vscode.commands.registerCommand('manager-assistant.captureLastCommit', async () => {
		try {
			if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
				throw new Error('Nenhum workspace aberto. Abra um projeto Git para usar esta extensão.');
			}

			const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
			const git = simpleGit(rootPath);

			// Mostra indicador de progresso
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Manager Assistant",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Capturando último commit..." });

				// Obtém a hash do último commit
				const log = await git.log(['-n', '1']);
				if (!log.latest) {
					throw new Error('Não foi possível obter o último commit');
				}

				const commitHash = log.latest.hash;
				const shortHash = commitHash.substring(0, 10);

				progress.report({ message: "Analisando arquivos alterados..." });

				// Obtém os arquivos alterados usando simple-git
				const artifacts = await parseGitChangesWithSimpleGit(git, commitHash);

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
			const git = simpleGit(rootPath);

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Manager Assistant",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Capturando alterações staged..." });

				// Obtém os arquivos staged usando simple-git
				const status = await git.status();

				// Verifica se há alterações staged
				if (!status.staged.length) {
					throw new Error('Não há alterações staged para capturar.');
				}

				// Processa cada arquivo staged
				const artifacts: Artifact[] = [];
				const user = await git.raw(['config', 'user.name']);
				const email = await git.raw(['config', 'user.email']);
				const author = `${user.trim()} <${email.trim()}>`;

				for (const file of status.staged) {
					let changeType: ChangeType;
					let filePath: string;

					// Se for um objeto com propriedades bem definidas
					if (typeof file === 'object' && file !== null) {
						// Tentativa 1: acessar como propriedade index
						if ('index' in file) {
							const index = (file as any).index;
							if (index === 'A') {
								changeType = ChangeType.New;
							} else if (index === 'M') {
								changeType = ChangeType.Update;
							} else if (index === 'D') {
								changeType = ChangeType.Delete;
							} else if (index === 'R') {
								changeType = ChangeType.Rename;
							} else {
								changeType = ChangeType.Other;
							}
						}
						// Tentativa 2: acessar primeiro caractere do status
						else if ('working_dir' in file && typeof (file as any).working_dir === 'string') {
							const status = (file as any).working_dir;
							if (status === 'A') {
								changeType = ChangeType.New;
							} else if (status === 'M') {
								changeType = ChangeType.Update;
							} else if (status === 'D') {
								changeType = ChangeType.Delete;
							} else if (status === 'R') {
								changeType = ChangeType.Rename;
							} else {
								changeType = ChangeType.Other;
							}
						} else {
							changeType = ChangeType.Other;
						}

						// Obter o caminho do arquivo
						if ('path' in file && typeof (file as any).path === 'string') {
							filePath = (file as any).path;
						} else if ('filepath' in file && typeof (file as any).filepath === 'string') {
							filePath = (file as any).filepath;
						} else if ('file' in file && typeof (file as any).file === 'string') {
							filePath = (file as any).file;
						} else {
							// Se não conseguir identificar o path, pule este arquivo
							continue;
						}
					}
					// Se for uma string (formato mais simples)
					else if (typeof file === 'string') {
						changeType = ChangeType.Update; // Assumir atualização por padrão
						filePath = file;
					} else {
						// Se não for nem objeto nem string, pule
						continue;
					}

					artifacts.push({
						path: filePath,
						type: detectFileType(filePath),
						changeType: changeType,
						complexity: detectComplexity(filePath),
						author: author
					});
				}

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
		commitsProvider.refresh();
		historyProvider.refresh();
	});

	// Comando para enviar para o Manager
	let sendToManagerCommand = vscode.commands.registerCommand('manager-assistant.sendToManager', (item: ArtifactItem) => {
		if (!item || !item.artifact) {
			vscode.window.showErrorMessage('Nenhum artefato selecionado.');
			return;
		}

		const artifact = item.artifact;
		// Adiciona o símbolo + para arquivos novos
		const prefix = artifact.changeType === ChangeType.New ? '+ ' : '';
		const formattedPath = `${prefix}${artifact.path}#${item.commitHash}`;

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

	// Comando para carregar artefatos de um commit do Git
	let loadCommitArtifactsCommand = vscode.commands.registerCommand('manager-assistant.loadCommitArtifacts', async (commitItem: any) => {
		try {
			if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
				throw new Error('Nenhum workspace aberto. Abra um projeto Git para usar esta extensão.');
			}

			if (!commitItem || !commitItem.id) {
				throw new Error('Commit inválido selecionado.');
			}

			const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
			const git = simpleGit(rootPath);

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Manager Assistant",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Carregando artefatos do commit..." });

				// Obter os arquivos alterados no commit usando simple-git
				const artifacts = await parseGitChangesWithSimpleGit(git, commitItem.id);

				// Atualiza a view
				artifactsProvider.refresh(artifacts, commitItem.id.substring(0, 10));

				progress.report({ message: `Encontrados ${artifacts.length} artefatos` });

				return new Promise(resolve => setTimeout(resolve, 1000));
			});

			// Foca na view de artefatos
			vscode.commands.executeCommand('managerAssistantExplorer.focus');

		} catch (error) {
			vscode.window.showErrorMessage('Erro ao carregar artefatos do commit: ' + (error as Error).message);
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
		// Adiciona o símbolo + para arquivos novos
		const prefix = artifact.changeType === ChangeType.New ? '+ ' : '';
		const formattedPath = `${prefix}${artifact.path}#${item.commitHash}`;

		vscode.env.clipboard.writeText(formattedPath);
		vscode.window.showInformationMessage('Link copiado: ' + formattedPath);
	});

	// Comando para copiar todos os artefatos
	let copyAllArtifactsCommand = vscode.commands.registerCommand('manager-assistant.copyAllArtifacts', () => {
		const links = artifactsProvider.copyAllLinks();

		if (links.length === 0) {
			vscode.window.showErrorMessage('Não há artefatos para copiar.');
			return;
		}

		// Junta todos os links com quebras de linha
		const allLinks = links.join('\n');

		vscode.env.clipboard.writeText(allLinks);
		vscode.window.showInformationMessage(`${links.length} links copiados para a área de transferência`);
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
	let loadReportCommand = vscode.commands.registerCommand('manager-assistant.loadReport', async (item?: any) => {
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

	// Atualiza o package.json para adicionar o novo comando para copiar todos os artefatos
	const packageJsonCommand = {
		command: 'manager-assistant.copyAllArtifacts',
		title: 'Copiar todos os artefatos',
		icon: '$(copy)'
	};

	// Registra todos os comandos no contexto da extensão
	context.subscriptions.push(
		captureLastCommitCommand,
		captureStagedChangesCommand,
		refreshCommitsCommand,
		sendToManagerCommand,
		loadCommitArtifactsCommand,
		editArtifactCommand,
		copyArtifactCommand,
		copyAllArtifactsCommand,
		removeArtifactCommand,
		saveReportCommand,
		loadReportCommand,
		showFiltersCommand
	);

	// Registra a disposição da barra de status
	context.subscriptions.push({ dispose: () => artifactsProvider.disposeStatusBarItem() });
}

// Função de desativação da extensão
export function deactivate() {
	// Nada específico a fazer na desativação
}