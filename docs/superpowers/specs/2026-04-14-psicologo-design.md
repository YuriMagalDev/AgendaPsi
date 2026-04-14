# Design Spec — Plataforma de Gestão para Psicólogos

**Data:** 2026-04-14  
**Status:** Aprovado  
**Projeto:** Psicologo  

---

## 1. Visão Geral

Aplicativo web para psicólogos gerirem agendamentos, confirmações e financeiro de forma integrada. Uso pessoal (um único psicólogo por instalação). Construído para web com migração futura para mobile via Capacitor.

### Objetivos
- Substituir controles manuais (planilhas, papel, WhatsApp manual) por uma plataforma centralizada
- Automatizar lembretes e confirmações de sessões via WhatsApp
- Dar visibilidade financeira real: receita, inadimplência, repasses e projeções
- Checklist fim de dia para atualizar status de sessões em lote

### Fora do escopo
- Prontuário clínico (anotações de sessão, diagnósticos, medicações)
- Multi-usuário / multi-clínica
- Portal do paciente (o paciente não acessa o app)

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript |
| Mobile (futuro) | Capacitor (empacota o mesmo app React) |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Automação WhatsApp | Evolution API (self-hosted em VPS próprio) |
| Estilo | TailwindCSS |

### Decisões arquiteturais
- O frontend conversa diretamente com Supabase via SDK (`supabase-js`) para todas as operações CRUD
- A integração com Evolution API é exclusivamente server-side via Edge Functions — credenciais nunca expostas ao frontend
- O Supabase Realtime atualiza o Kanban instantaneamente quando chega uma confirmação via WhatsApp
- Ao criar uma conta, uma Edge Function provisiona automaticamente uma instância na Evolution API e armazena as credenciais no banco

---

## 3. Modelo de Dados

### `pacientes`
```
id               uuid PK
nome             text NOT NULL
telefone         text
email            text
data_nascimento  date
ativo            boolean DEFAULT true
criado_em        timestamptz DEFAULT now()
```

### `modalidades`
```
id        uuid PK
nome      text NOT NULL  -- ex: "Presencial", "Online", "Domiciliar"
ativo     boolean DEFAULT true
```

### `contratos`
Forma de cobrança por paciente. Um paciente pode ter um contrato ativo por vez.
```
id               uuid PK
paciente_id      uuid FK → pacientes
tipo             enum('por_sessao', 'pacote', 'mensal')
valor            numeric NOT NULL
qtd_sessoes      int         -- só para tipo 'pacote'
dia_vencimento   int         -- só para tipo 'mensal' (dia do mês)
ativo            boolean DEFAULT true
criado_em        timestamptz DEFAULT now()
```

### `sessoes`
Cada atendimento agendado, seja com paciente cadastrado ou avulso.
```
id                uuid PK
paciente_id       uuid FK → pacientes  NULLABLE
avulso_nome       text                  -- preenchido quando paciente_id é nulo
avulso_telefone   text                  -- opcional para avulsos
modalidade_id     uuid FK → modalidades
data_hora         timestamptz NOT NULL
status            enum('agendada', 'confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada')
valor_cobrado     numeric
pago              boolean DEFAULT false
data_pagamento    date
remarcada_para    timestamptz           -- nova data quando status = 'remarcada'
sessao_origem_id  uuid FK → sessoes    -- rastreia histórico de remarcações
criado_em         timestamptz DEFAULT now()
```

### `regras_repasse`
Regras globais de repasse definidas pelo psicólogo (ex: "sempre enviar 20% para a clínica").
```
id           uuid PK
nome         text NOT NULL   -- ex: "Repasse clínica"
tipo_valor   enum('percentual', 'fixo')
valor        numeric NOT NULL
ativo        boolean DEFAULT true
```

### `repasses`
Registros gerados por sessão a partir das regras acima.
```
id                uuid PK
regra_repasse_id  uuid FK → regras_repasse
sessao_id         uuid FK → sessoes
valor_calculado   numeric NOT NULL  -- valor efetivo calculado no momento da sessão
pago              boolean DEFAULT false
data_pagamento    date
```

### `confirmacoes_whatsapp`
Log da automação de lembretes.
```
id                    uuid PK
sessao_id             uuid FK → sessoes
mensagem_enviada_em   timestamptz
resposta              text
confirmado            boolean
```

### `config_psicologo`
Configurações globais da conta.
```
id                       uuid PK
nome                     text
horario_inicio           time
horario_fim              time
horario_checklist        time   -- ex: 18:00
automacao_whatsapp_ativa boolean DEFAULT false
evolution_instance_name  text   -- gerenciado internamente, nunca exposto ao frontend
evolution_token          text   -- gerenciado internamente, nunca exposto ao frontend
whatsapp_conectado       boolean DEFAULT false
```

---

## 4. Módulos e Funcionalidades

### 4.1 Autenticação
- Login com email + senha via Supabase Auth
- Sessão persistente
- Conta criada manualmente (sem cadastro público)

### 4.2 Pacientes
- Cadastro: nome, WhatsApp, email, data de nascimento, modalidade padrão, contrato de cobrança
- Listagem com busca por nome
- Perfil: histórico de sessões, total pago, faltas, remarcações
- Arquivar paciente (sem deletar histórico)

### 4.3 Agenda (duas visões)

**Visão Kanban por status:**
Colunas: `A confirmar` · `Confirmado` · `Concluído` · `Faltou` · `Cancelado` · `Remarcado`
Cada card: nome do paciente, horário, modalidade, valor

**Visão Agenda por dia:**
Lista cronológica do dia selecionado com os mesmos cards

- Navegação entre dias em ambas as visões
- Criação de sessão avulsa ou para paciente cadastrado direto da agenda
- Kanban atualizado em tempo real via Supabase Realtime

### 4.4 Atendimentos Avulsos
- Sessão sem paciente cadastrado: preenche nome + telefone (opcional) + valor + modalidade
- Botão "Converter em paciente" no card do avulso
- Ao converter: abre formulário pré-preenchido; sessões avulsas anteriores são vinculadas ao novo cadastro

### 4.5 Checklist Fim de Dia
- Disparo automático no horário configurado (padrão: 18h)
- Exibe todas as sessões do dia com status ainda em `agendada` ou `confirmada`
- Para cada sessão: botões **Concluída · Faltou · Cancelada · Remarcada**
- Se "Remarcada": abre seletor de nova data/hora
- Atualização em batch ao finalizar

### 4.6 Automação WhatsApp (Evolution API) — opcional
- **QR Code de check-in:** QR gerado por paciente; ao escanear, registra o número no sistema
- **Lembrete D-1:** Edge Function cron diária envia mensagem com botão sim/não para cada sessão do dia seguinte
- **Webhook de resposta:** Evolution API → Edge Function → atualiza status no banco → Realtime reflete no Kanban
- Quando desativada: app funciona normalmente; confirmações são manuais

### 4.7 Financeiro
- Painel mensal: receita total, sessões pagas/pendentes, inadimplência
- Detalhamento por paciente: total histórico, última sessão, saldo pendente
- Repasses: valor devido por clínica/supervisor no mês (fixo ou percentual)
- Projeção: estimativa do mês com base nas sessões agendadas

### 4.8 Configurações
- Gerenciar modalidades (criar, editar, arquivar)
- Configurar horário do checklist fim de dia
- Status da conexão WhatsApp + reconectar
- Dados do psicólogo (nome, horário de atendimento)

---

## 5. Onboarding (Primeiro Acesso)

Wizard de 3 etapas ao criar conta:

**Etapa 1 — Dados básicos**
Nome, horário de atendimento, horário do checklist.

**Etapa 2 — Modalidades**
Confirma "Presencial" e "Online"; pode adicionar outras.

**Etapa 3 — WhatsApp (opcional)**
Apresenta aviso de boas práticas antes de qualquer configuração:

> "Recomendamos usar um número de WhatsApp dedicado ao consultório — não o seu número pessoal. Isso evita misturar conversas com pacientes e protege sua privacidade. Você precisará de um chip separado ou número virtual."

Opções:
- **Configurar agora:** app provisiona instância Evolution API automaticamente → exibe QR Code → confirma conexão
- **Configurar depois:** pula para o app
- **Não usar automação:** desativa (reversível em Configurações)

O psicólogo nunca vê URL, token ou qualquer dado técnico da Evolution API.

---

## 6. Navegação

```
/login
/onboarding

/agenda          (padrão)
/kanban
/checklist

/pacientes
/pacientes/novo
/pacientes/:id

/financeiro
/financeiro/paciente/:id

/configuracoes
```

**Bottom navigation (mobile) / Sidebar (desktop):**
Agenda · Kanban · Pacientes · Financeiro · Configurações

---

## 7. Tratamento de Erros

| Situação | Comportamento |
|---|---|
| Evolution API offline | Banner discreto; app funciona normalmente sem automação |
| Paciente não responde lembrete | Sessão fica em `a confirmar`; aparece destacada no checklist |
| Remarcação | Nova sessão criada com `sessao_origem_id`; histórico visível no perfil |
| Sessão sem contrato | Permite valor avulso na criação |
| Avulso sem telefone | Lembrete WhatsApp não enviado; sem erro |

---

## 8. Testes

- Testes de integração nas Edge Functions (lembrete D-1, webhook, provisionamento)
- Testes manuais nas telas principais antes de cada deploy
- Sem E2E automatizado na fase inicial

---

## 9. Infraestrutura

- VPS próprio rodando Evolution API (self-hosted)
- Supabase project (hosted)
- Deploy do frontend: Vercel ou Netlify
- Mobile (futuro): Capacitor empacota o build React para iOS/Android
