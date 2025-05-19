# Manager Assistant - Extensão para VSCode

## Descrição
O Manager Assistant é uma extensão para VSCode que facilita a geração de links formatados para relatórios no Manager, utilizado pelo BBTS para rastreamento de trabalho em projetos.

## Recursos Principais

### Captura de Commits
- **Capturar Último Commit**: Analisa o último commit e extrai todos os arquivos alterados
- **Capturar Alterações Staged**: Analisa arquivos em staging e os prepara para relatório
- **Extração de Tarefa**: Identifica automaticamente o número da tarefa a partir da mensagem do commit

### Filtragem de Artefatos
- **Filtro por Autor**: Identifica e filtra contribuições por identificação de desenvolvedor
- **Filtro por Tarefa**: Filtra commits e artefatos por número de tarefa
- **Filtros Persistentes**: Mantém as configurações de filtro entre sessões

### Visualização
- **Artefatos do Manager**: Visualiza todos os artefatos capturados com informações detalhadas
- **Commits Git**: Navegação por commits recentes com opção de carregar artefatos
- **Histórico de Relatórios**: Acesso a relatórios salvos anteriormente

### Operações
- **Copiar Links**: Copia links individuais ou múltiplos para relatórios
- **Editar Complexidade**: Ajusta a complexidade dos artefatos para pontuação no BBTS
- **Salvar Relatórios**: Armazena relatórios para uso posterior

## Organização da Interface

A extensão possui três visualizações principais:

1. **Artefatos do Manager**: Mostra os artefatos atualmente carregados com seus detalhes
2. **Commits Git**: Lista os commits mais recentes do repositório
3. **Histórico de Relatórios**: Mostra os relatórios salvos anteriormente

## Como Usar

### Capturando Artefatos
1. Clique em "Capturar último commit" para carregar os artefatos do último commit
2. Ou clique em "Capturar alterações staged" para carregar arquivos em staging

### Filtrando
1. Na view "Artefatos do Manager", preencha os campos de filtro:
   - "Identificação do Autor" para filtrar por desenvolvedor
   - "Número da Tarefa" para filtrar por tarefa específica

### Copiando Links
1. Passe o mouse sobre um artefato para ver o botão de cópia
2. Clique no botão "Copiar Todos" para copiar todos os links de uma vez

### Navegando por Commits
1. Use a view "Commits Git" para ver commits recentes
2. Clique em um commit para carregar seus artefatos

## Requisitos
- VS Code 1.80.0 ou superior
- Git instalado e configurado no workspace

## Extensão Desenvolvida para
Banco do Brasil Tecnologia e Serviços (BBTS)

---

### Configurações

Esta extensão contribui com as seguintes configurações:

* `managerAssistant.apiEndpoint`: URL da API do Manager para integração direta
* `managerAssistant.defaultComplexity`: Complexidade padrão para novos arquivos
* `managerAssistant.reportHistoryLimit`: Número máximo de relatórios a manter no histórico
* `managerAssistant.defaultAuthor`: Identificação padrão do autor
* `managerAssistant.defaultTaskFormat`: Formato padrão para reconhecimento de tarefas