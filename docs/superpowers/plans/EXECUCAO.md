# Plano de Execução — SaaS Multi-Tenant AgendaPsi

**Data:** 2026-04-27  
**Status:** Pendente

---

## Visão geral

**Fase 1 — Infraestrutura SaaS** (Planos 1–4): sequencialmente dependentes, devem ser executados em ordem. Transformam o app single-user em SaaS com multi-tenancy, assinaturas e pagamento.

**Fase 2 — Features Diferenciais** (Planos 5–7): independentes entre si, podem ser executados em qualquer ordem após a Fase 1. Requerem multi-tenant (Plano 1) e WhatsApp conectado.

```
Fase 1: Plano 1 → Plano 2 → Plano 3 → Plano 4
Fase 2: Plano 5, Plano 6, Plano 7  (paralelos, após Fase 1)
```

---

## Plano 1 — Multi-Tenant Isolation

**Arquivo:** `docs/superpowers/plans/2026-04-27-multi-tenant.md`  
**Status:** [ ] Pendente

**O que faz:**
- Migração 017: adiciona `user_id` em todas as tabelas tenant-scoped
- RLS: substitui `"auth users full access"` por `tenant_isolation` (filtra por `auth.uid() = user_id`)
- Trigger `set_user_id`: auto-preenche `user_id` no INSERT (frontend nunca envia)
- Trigger `handle_new_user`: provisiona `config_psicologo`, 4 modalidades e 3 meios para cada signup
- Edge Functions: `send-lembrete`, `cron-lembretes`, `whatsapp-webhook`, `whatsapp-setup` adaptados para multi-tenant
- Frontend: `OnboardingPage` insert→update, `ProtectedRoute` checa `nome`, `LoginPage` ganha signup

**Pré-requisitos:** Nenhum. Ponto de partida.

**Resultado:** App funciona para múltiplos usuários com isolamento total de dados.

---

## Plano 2 — Subscriptions & Billing Model

**Arquivo:** `docs/superpowers/plans/2026-04-27-subscriptions.md`  
**Status:** [ ] Pendente

**O que faz:**
- Migração 018: tabela `assinaturas` (plano, status, trial_fim, stripe IDs)
- Estende `handle_new_user` com `INSERT INTO assinaturas` (trial 14 dias, plano `completo`)
- Tipos: `Plano`, `StatusAssinatura`, `Assinatura` em `src/lib/types.ts`
- Hook `useAssinatura`: retorna `isTrialAtivo`, `diasRestantesTrial`, `podUsarWhatsapp`, `assinaturaAtiva`
- 7 testes unitários para o hook

**Pré-requisitos:** Plano 1 aplicado (`handle_new_user` trigger deve existir).

**Resultado:** Camada de dados de assinatura completa. Sem UI ainda.

---

## Plano 3 — Feature Gating

**Arquivo:** `docs/superpowers/plans/2026-04-27-feature-gating.md`  
**Status:** [ ] Pendente

**O que faz:**
- `ConfiguracoesPage`: seção WhatsApp gatekeada — Básico vê card de upgrade
- `KanbanPage`: Realtime Supabase só ativo para plano Completo
- Nova página `PlanoPage` (`/plano`): status trial/ativo/inadimplente/cancelado + cards de plano
- `AppLayout`: banner trial (dias restantes) e banner inadimplente
- `Sidebar` + `BottomNav`: item "Plano" com ícone Crown + badge trial
- `router.tsx`: rota `/plano`
- `send-lembrete` + `whatsapp-setup`: retornam 403 para usuários sem plano Completo

**Pré-requisitos:** Planos 1 e 2 aplicados. `useAssinatura` deve existir.

**Resultado:** UI completa de planos. Botões "Assinar" na PlanoPage já chamam `stripe-checkout` e `stripe-portal` (que viram reais no Plano 4).

---

## Plano 4 — Stripe Integration

**Arquivo:** `docs/superpowers/plans/2026-04-27-stripe.md`  
**Status:** [ ] Pendente

**O que faz:**
- Setup manual no Stripe Dashboard: 2 produtos (Básico R$30, Completo R$50), PIX + cartão
- Edge Function `stripe-checkout`: autentica usuário, cria/reutiliza customer Stripe, retorna URL do Checkout
- Edge Function `stripe-webhook`: verifica assinatura, atualiza `assinaturas` nos eventos `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- Edge Function `stripe-portal`: autentica usuário, retorna URL do Billing Portal
- `.env.example`: placeholders das variáveis Stripe

**Pré-requisitos:** Planos 1, 2 e 3 aplicados. `assinaturas` e `PlanoPage` devem existir.

**Resultado:** Cobrança recorrente funcionando. Trial → pagar → plano ativo → cancelar — fluxo completo.

---

---

## Plano 5 — Régua de Cobrança

**Spec:** `docs/superpowers/specs/2026-04-27-regua-cobranca-design.md`  
**Plano de implementação:** ainda não criado  
**Status:** [ ] Pendente

**O que faz:**
- Sequência automática de até 3 mensagens WhatsApp para sessões não pagas
- Templates customizáveis com variáveis `{{nome}}`, `{{valor}}`, `{{data_sessao}}`, `{{chave_pix}}`
- Chave PIX configurada nas Settings (não auto-gerada)
- Modo auto (disparo automático) ou manual (fila de aprovação)
- `pago=true` para a sequência automaticamente
- 2 tabelas novas: `regras_cobranca`, `cobracas_enviadas`
- Edge function `cobranca-whatsapp` + cron `cron-cobrancas` (hourly)
- Nova página `/cobranca`
- Migração: **019**

**Pré-requisitos:** Fase 1 completa. WhatsApp conectado (plano Completo).

---

## Plano 6 — Google Calendar Sync

**Spec:** `docs/superpowers/specs/2026-04-27-google-calendar-sync-design.md`  
**Plano de implementação:** ainda não criado  
**Status:** [ ] Pendente

**O que faz:**
- Exporta sessões AgendaPsi → Google Calendar (padrão, one-way)
- Bidirecional opcional: eventos externos bloqueiam slots no AgendaPsi
- OAuth 2.0 com tokens encriptados via Supabase Vault
- 3 tabelas novas: `google_oauth_tokens`, `sessions_sync_map`, `sessions_external_busy`
- 4 edge functions: `google-calendar-auth`, `google-calendar-sync`, `google-calendar-bidirectional-sync`, `google-calendar-ical`
- iCal URL pública para Apple Calendar (sem OAuth)
- Seção de conexão em Configurações
- Migração: **020**

**Pré-requisitos:** Fase 1 completa. Google Cloud project com Calendar API habilitada.

---

## Plano 7 — Pacientes em Risco

**Spec:** `docs/superpowers/specs/2026-04-27-pacientes-em-risco-design.md`  
**Plano de implementação:** ainda não criado  
**Status:** [ ] Pendente

**O que faz:**
- Detecta padrões de abandono: cancelamentos consecutivos, dias sem sessão, faltou sem reagendamento
- Thresholds configuráveis por psicólogo
- Nova página `/pacientes/risco` com lista priorizada por nível de risco (Alto/Médio)
- Templates WhatsApp customizáveis com variáveis `{{nome}}`, `{{dias_ausente}}`, `{{ultima_sessao}}`
- Disparo via Evolution API com um clique + log de outcome
- 3 tabelas novas: `risco_config`, `risco_templates`, `risco_followups`
- Edge function `send-followup`
- Migração: **021**

**Pré-requisitos:** Fase 1 completa. WhatsApp conectado (plano Completo).

---

## Checklist de deploy final

- [ ] Migração 017 aplicada no Supabase (SQL Editor)
- [ ] Migração 018 aplicada no Supabase (SQL Editor)
- [ ] Signup público habilitado no Supabase Dashboard → Auth → Settings
- [ ] 4 edge functions do Plano 1 deployadas (`send-lembrete`, `cron-lembretes`, `whatsapp-webhook`, `whatsapp-setup`)
- [ ] 3 edge functions do Plano 4 deployadas (`stripe-checkout`, `stripe-webhook`, `stripe-portal`)
- [ ] Secrets Stripe setadas via `supabase secrets set`
- [ ] Webhook endpoint configurado no Stripe Dashboard
- [ ] Billing Portal habilitado no Stripe Dashboard
- [ ] Teste e2e: signup → onboarding → criar paciente → assinar → WhatsApp liberado

**Fase 2 (após Fase 1 estável):**
- [ ] Planos de implementação criados para Planos 5, 6 e 7
- [ ] Migração 019 aplicada (Régua de Cobrança)
- [ ] Migração 020 aplicada (Google Calendar Sync)
- [ ] Migração 021 aplicada (Pacientes em Risco)
- [ ] Google Cloud project configurado com Calendar API + OAuth credentials
- [ ] Edge functions Fase 2 deployadas

---

## Variáveis de ambiente necessárias (Edge Functions)

Já existentes:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `WEBHOOK_SECRET`

Novas (Plano 4):
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_BASICO=price_...
supabase secrets set STRIPE_PRICE_COMPLETO=price_...
```
