import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

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

const schema = z.object({
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

type FormData = z.infer<typeof schema>

const inputClass =
  'h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors w-full'

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

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const watchedPassword = watch('password', '')
  const strength = passwordStrength(watchedPassword)

  useEffect(() => {
    // Supabase may process the recovery token before this component mounts
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function onSubmit(data: FormData) {
    setServerError(null)
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setServerError(error.message)
      return
    }
    setSuccess(true)
    setTimeout(() => navigate('/login'), 2500)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-semibold text-primary mb-2">Consultório</h1>
          <p className="text-muted text-sm">Gestão para psicólogos</p>
        </div>

        <div className="bg-surface rounded-card border border-border shadow-sm p-6">
          <p className="font-medium text-[#1C1C1C] mb-1">Nova senha</p>
          <p className="text-sm text-muted mb-4">Escolha uma senha segura para sua conta.</p>

          {success ? (
            <div className="bg-[#E8F4F4] border border-primary/20 rounded-lg px-4 py-3 text-center">
              <p className="text-sm font-medium text-primary mb-1">Senha atualizada!</p>
              <p className="text-xs text-muted">Redirecionando para o login...</p>
            </div>
          ) : !ready ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted">Validando link de redefinição...</p>
              <p className="text-xs text-muted mt-2">
                Se demorar, verifique se o link do e-mail não expirou.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Field label="Nova senha" error={errors.password?.message}>
                <input
                  type="password"
                  placeholder="Mín. 8 caracteres"
                  className={inputClass}
                  {...register('password')}
                />
                {watchedPassword && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex gap-0.5 flex-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div
                          key={i}
                          className="h-1 flex-1 rounded-full transition-all duration-300"
                          style={{ backgroundColor: i <= strength.score ? strength.color : '#E4E0DA' }}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-medium" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </Field>

              <Field label="Confirmar senha" error={errors.confirmPassword?.message}>
                <input
                  type="password"
                  placeholder="Repita a senha"
                  className={inputClass}
                  {...register('confirmPassword')}
                />
              </Field>

              {serverError && (
                <p className="text-xs text-[#E07070] text-center">{serverError}</p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary hover:bg-primary/90 text-white"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
