<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Shadcn_UI-000000?style=for-the-badge&logo=shadcnui&logoColor=white" />
</p>

# 🧠 AgendaPsi

<p align="center">
  <strong>Plataforma de gestão inteligente para psicólogos</strong><br>
  Agendamentos, confirmações de sessão automatizadas e controle financeiro, tudo em um único lugar.
</p>

---

## 📋 Sobre o Projeto

**AgendaPsi** é uma aplicação web desenhada especificamente para psicólogos clínicos. O objetivo é substituir o uso de planilhas complexas e aplicativos genéricos por uma solução coesa e humanizada. Com uma interface acolhedora — pensada como um *"Consultório Digital"* —, a plataforma otimiza a rotina diária ao unificar o controle de sessões, a gestão de pacientes e a visão financeira.

Idealizada para uso pessoal (single-user), a aplicação foca na gestão administrativa, sem atuar como prontuário eletrônico.

## ✨ Funcionalidades Principais

- 🔐 **Autenticação Segura:** Login utilizando Supabase Auth.
- 👤 **Gestão de Pacientes:** Cadastro ágil e focado na operação (dados de contato e modelo de cobrança).
- 📅 **Agenda e Kanban:** Visão diária em calendário e organização de atendimentos através de um painel Kanban com atualizações em tempo real.
- ✅ **Checklist Inteligente:** Processamento em lote (batch) para atualizar o status das sessões ao final de um longo dia.
- 💬 **Integração com WhatsApp:** Lembretes automáticos enviados no dia anterior (D-1) à sessão. Respostas "sim" ou "não" do paciente atualizam o status no Kanban automaticamente via Evolution API.
- 💰 **Dashboard Financeiro:** Controle detalhado de receitas (mensal, por paciente), configuração de regras de repasse (ex: 20% para clínica), inadimplência e projeção de faturamento.

## 🏗️ Stack Tecnológica

O AgendaPsi utiliza ferramentas modernas para garantir performance, segurança e uma interface de alta qualidade:

### Frontend
- **Framework:** React 19 com Vite 6 e TypeScript 5.8
- **Estilização:** Tailwind CSS 4 e componentes estilizados do [shadcn/ui](https://ui.shadcn.com/)
- **UI UX e Acessibilidade:** Componentes Vaul, Sonner, Base UI, Lucide Icons
- **Gestão de Formulários:** React Hook Form e Zod
- **Visualização de Dados:** Recharts

### Backend / Infraestrutura
- **BaaS:** [Supabase](https://supabase.com/) (PostgreSQL, Auth, Realtime para o Kanban, e Edge Functions)
- **Mensageria:** Evolution API (Self-hosted) para integração com WhatsApp

---

## 🗃️ Modelo de Dados Simplificado

A arquitetura de dados do projeto no PostgreSQL é composta, de forma resumida, por:

- `pacientes`: Dados essenciais (nome, contato).
- `modalidades`: Tipo de atendimento (Online, Presencial, etc).
- `contratos`: Modelos de faturamento (Sessão avulsa, pacote ou mensal).
- `sessoes`: Atendimentos agendados, com controle de status.
- `regras_repasse` & `repasses`: Cálculo de comissões para terceiros ou clínicas.
- `confirmacoes_whatsapp`: Histórico de envio de mensagens e interação.
- `config_psicologo`: Preferências do usuário.

### Ciclo de Vida da Sessão (Status)
🔘 **Agendada** ➔ 🟢 **Confirmada** (via app ou WhatsApp) ➔ ✅ **Concluída** / 🟠 **Faltou** / 🔴 **Cancelada** / 🟣 **Remarcada**

---

## 🚀 Como Rodar o Projeto

### 1. Pré-requisitos
- [Node.js](https://nodejs.org/) v18+
- Conta gratuita no [Supabase](https://supabase.com/)

### 2. Instalação e Configuração

```bash
# Clone o repositório
git clone https://github.com/YuriMagalDev/AgendaPsi.git
cd AgendaPsi

# Instale as dependências
npm install

# Prepare o arquivo de variáveis de ambiente
cp .env.example .env
```

### 3. Configurando o Supabase

1. Crie um novo projeto no [Dashboard do Supabase](https://app.supabase.com/).
2. Copie a `VITE_SUPABASE_URL` e a `VITE_SUPABASE_ANON_KEY` para o seu `.env`.
3. Vá no painel do Supabase > **SQL Editor**, cole o conteúdo de `supabase/migrations/001_initial_schema.sql` (e outras migrations se houver) e execute.

### 4. Executando Localmente

```bash
# Inicie o servidor de desenvolvimento
npm run dev

# Para build em modo de produção
npm run build && npm run preview
```

### 5. Executando os Testes

O projeto utiliza `vitest` e `@testing-library/react` para garantir a estabilidade.

```bash
npm run test           # Roda os testes em modo watch
npm run test:coverage  # Roda e gera relatório de cobertura
```

---

## 📁 Estrutura de Diretórios

```
AgendaPsi/
├── src/
│   ├── components/       # Componentes React (layout e shadcn/ui)
│   ├── contexts/         # React Contexts (Ex: Auth)
│   ├── hooks/            # Custom hooks
│   ├── lib/              # Integração Supabase, utilitários, tipos
│   ├── pages/            # Rotas e páginas (Agenda, Kanban, Financeiro)
│   ├── router.tsx        # Configuração de roteamento (React Router)
│   └── index.css         # Tailwind e Design Tokens
├── supabase/
│   ├── migrations/       # Scripts SQL do banco de dados
│   └── functions/        # Edge Functions para webhooks do WhatsApp
└── docs/                 # Documentação de planejamento e especificações
```

---

## 🎨 Design System

A interface é guiada por uma estética humanizada:
- **Cores:** Tons terrenos e acolhedores (Fundo off-white `#F7F5F2`, Teal escuro `#2D6A6A`, Âmbar `#C17F59`).
- **Tipografia:** Uso da fonte *Fraunces* para títulos (trazendo personalidade e um tom orgânico) e *DM Sans* para a legibilidade do corpo do texto.

---

## 📄 Licença e Uso

Este é um projeto de código privado focado em uso pessoal de consultório psicológico (Single-user).

<p align="center">
  Feito com 💚 para psicólogos.
</p>
