import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Mode = 'login' | 'signup' | 'forgot'

// ─── CPF ────────────────────────────────────────────────────────────────────

function validateCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
  let c = (s * 10) % 11; if (c >= 10) c = 0
  if (c !== +d[9]) return false
  s = 0
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
  c = (s * 10) % 11; if (c >= 10) c = 0
  return c === +d[10]
}

function maskCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// ─── Força da senha ──────────────────────────────────────────────────────────

function passwordStrength(p: string) {
  let score = 0
  if (p.length >= 8) score++
  if (/[A-Z]/.test(p)) score++
  if (/[a-z]/.test(p)) score++
  if (/[0-9]/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  const labels = ['', 'Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte']
  const colors = ['', '#E07070', '#C17F59', '#E0B020', '#4CAF82', '#2D6A6A']
  return { score, label: p ? labels[score] : '', color: colors[score] }
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

const signupSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  cpf: z.string().refine(validateCPF, 'CPF inválido'),
  email: z.string().email('E-mail inválido'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter letra maiúscula')
    .regex(/[a-z]/, 'Deve conter letra minúscula')
    .regex(/[0-9]/, 'Deve conter número')
    .regex(/[^A-Za-z0-9]/, 'Deve conter caractere especial (!@#$...)'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})

const forgotSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

type LoginData = z.infer<typeof loginSchema>
type SignupData = z.infer<typeof signupSchema>
type ForgotData = z.infer<typeof forgotSchema>

// ─── Componente base de campo ─────────────────────────────────────────────────

function Field({ label, error, children }: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium text-[#1C1C1C]">{label}</Label>
      {children}
      {error && <span className="text-xs text-[#E07070]">{error}</span>}
    </div>
  )
}

const inputClass =
  'h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors w-full'

// ─── LoginPage ────────────────────────────────────────────────────────────────

function PasswordInput({ placeholder, className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} placeholder={placeholder} className={className} {...props} />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-[#1C1C1C] transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [serverError, setServerError] = useState<string | null>(null)
  const [forgotSent, setForgotSent] = useState(false)

  const loginForm = useForm<LoginData>({ resolver: zodResolver(loginSchema) })
  const signupForm = useForm<SignupData>({ resolver: zodResolver(signupSchema) })
  const forgotForm = useForm<ForgotData>({ resolver: zodResolver(forgotSchema) })

  const watchedPassword = signupForm.watch('password', '')
  const strength = passwordStrength(watchedPassword)
  const watchedCPF = signupForm.watch('cpf', '')

  function switchMode(m: Mode) {
    setMode(m)
    setServerError(null)
    setForgotSent(false)
  }

  async function handleLogin(data: LoginData) {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error) {
      setServerError('Credenciais inválidas. Verifique seu e-mail e senha.')
      return
    }
    navigate('/agenda')
  }

  async function handleSignup(data: SignupData) {
    setServerError(null)
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { nome: data.nome, cpf: data.cpf } },
    })
    if (error) {
      setServerError(error.message)
      return
    }
    navigate('/onboarding')
  }

  async function handleForgot(data: ForgotData) {
    setServerError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setServerError(error.message)
      return
    }
    setForgotSent(true)
  }

  const isSignup = mode === 'signup'

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className={`w-full transition-all duration-300 ${isSignup ? 'max-w-md' : 'max-w-sm'}`}>
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-semibold text-primary mb-2">Consultório</h1>
          <p className="text-muted text-sm">Gestão para psicólogos</p>
        </div>

        <div className="bg-surface rounded-card border border-border shadow-sm">
          {/* ── Tabs ── */}
          <div className="flex border-b border-border">
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'text-primary border-b-2 border-primary -mb-px'
                    : 'text-muted hover:text-[#1C1C1C]'
                }`}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* ─── LOGIN ─── */}
            {mode === 'login' && (
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="flex flex-col gap-4">
                <Field label="E-mail" error={loginForm.formState.errors.email?.message}>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    className={inputClass}
                    {...loginForm.register('email')}
                  />
                </Field>

                <Field label="Senha" error={loginForm.formState.errors.password?.message}>
                  <PasswordInput
                    placeholder="••••••••"
                    className={inputClass}
                    {...loginForm.register('password')}
                  />
                </Field>

                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs text-muted hover:text-primary transition-colors text-right -mt-2"
                >
                  Esqueceu a senha?
                </button>

                {serverError && (
                  <p className="text-xs text-[#E07070] text-center">{serverError}</p>
                )}

                <Button
                  type="submit"
                  disabled={loginForm.formState.isSubmitting}
                  className="w-full bg-primary hover:bg-primary/90 text-white mt-1"
                >
                  {loginForm.formState.isSubmitting ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>
            )}

            {/* ─── SIGNUP ─── */}
            {mode === 'signup' && (
              <form onSubmit={signupForm.handleSubmit(handleSignup)} className="flex flex-col gap-4">
                <Field label="Nome completo" error={signupForm.formState.errors.nome?.message}>
                  <input
                    type="text"
                    placeholder="Seu nome completo"
                    className={inputClass}
                    {...signupForm.register('nome')}
                  />
                </Field>

                <Field label="CPF" error={signupForm.formState.errors.cpf?.message}>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    className={inputClass}
                    value={watchedCPF}
                    onChange={e => {
                      const masked = maskCPF(e.target.value)
                      signupForm.setValue('cpf', masked, { shouldValidate: signupForm.formState.isSubmitted })
                    }}
                  />
                </Field>

                <Field label="E-mail" error={signupForm.formState.errors.email?.message}>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    className={inputClass}
                    {...signupForm.register('email')}
                  />
                </Field>

                <Field label="Senha" error={signupForm.formState.errors.password?.message}>
                  <PasswordInput
                    placeholder="Mín. 8 caracteres"
                    className={inputClass}
                    {...signupForm.register('password')}
                  />
                  {watchedPassword && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex gap-0.5 flex-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div
                            key={i}
                            className="h-1 flex-1 rounded-full transition-all duration-300"
                            style={{
                              backgroundColor: i <= strength.score ? strength.color : '#E4E0DA',
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium" style={{ color: strength.color }}>
                        {strength.label}
                      </span>
                    </div>
                  )}
                  {watchedPassword && strength.score < 5 && (
                    <p className="text-xs text-muted">
                      Exigido: maiúscula, minúscula, número e caractere especial
                    </p>
                  )}
                </Field>

                <Field label="Confirmar senha" error={signupForm.formState.errors.confirmPassword?.message}>
                  <PasswordInput
                    placeholder="Repita a senha"
                    className={inputClass}
                    {...signupForm.register('confirmPassword')}
                  />
                </Field>

                {serverError && (
                  <p className="text-xs text-[#E07070] text-center">{serverError}</p>
                )}

                <Button
                  type="submit"
                  disabled={signupForm.formState.isSubmitting}
                  className="w-full bg-primary hover:bg-primary/90 text-white mt-1"
                >
                  {signupForm.formState.isSubmitting ? 'Criando conta...' : 'Criar conta'}
                </Button>
              </form>
            )}

            {/* ─── FORGOT ─── */}
            {mode === 'forgot' && (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-medium text-[#1C1C1C] mb-1">Redefinir senha</p>
                  <p className="text-sm text-muted">
                    Informe seu e-mail e enviaremos um link para criar uma nova senha.
                  </p>
                </div>

                {forgotSent ? (
                  <div className="bg-[#E8F4F4] border border-primary/20 rounded-lg px-4 py-3 text-center">
                    <p className="text-sm font-medium text-primary mb-1">E-mail enviado!</p>
                    <p className="text-xs text-muted">
                      Verifique sua caixa de entrada e clique no link para redefinir a senha.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={forgotForm.handleSubmit(handleForgot)} className="flex flex-col gap-4">
                    <Field label="E-mail" error={forgotForm.formState.errors.email?.message}>
                      <input
                        type="email"
                        placeholder="seu@email.com"
                        className={inputClass}
                        {...forgotForm.register('email')}
                      />
                    </Field>

                    {serverError && (
                      <p className="text-xs text-[#E07070] text-center">{serverError}</p>
                    )}

                    <Button
                      type="submit"
                      disabled={forgotForm.formState.isSubmitting}
                      className="w-full bg-primary hover:bg-primary/90 text-white"
                    >
                      {forgotForm.formState.isSubmitting ? 'Enviando...' : 'Enviar link'}
                    </Button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-sm text-muted hover:text-primary transition-colors text-center"
                >
                  ← Voltar para o login
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
