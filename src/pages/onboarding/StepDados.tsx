import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  nome: z.string().min(2, 'Informe seu nome'),
  horario_inicio: z.string().min(1, 'Obrigatório'),
  horario_fim: z.string().min(1, 'Obrigatório'),
  horario_checklist: z.string().min(1, 'Obrigatório'),
})

export type StepDadosData = z.infer<typeof schema>

interface Props {
  onNext: (data: StepDadosData) => void
}

export function StepDados({ onNext }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StepDadosData>({
    resolver: zodResolver(schema),
    defaultValues: {
      horario_inicio: '08:00',
      horario_fim: '18:00',
      horario_checklist: '18:00',
    },
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Seus dados</h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Seu nome</Label>
        <Input id="nome" placeholder="Dra. Ana Silva" {...register('nome')} />
        {errors.nome && <span className="text-xs text-[#E07070]">{errors.nome.message}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="horario_inicio">Início</Label>
          <Input id="horario_inicio" type="time" {...register('horario_inicio')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="horario_fim">Fim</Label>
          <Input id="horario_fim" type="time" {...register('horario_fim')} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="horario_checklist">Checklist fim de dia</Label>
        <Input id="horario_checklist" type="time" {...register('horario_checklist')} />
        <span className="text-xs text-muted">
          Horário em que o app vai te lembrar de revisar as sessões do dia.
        </span>
      </div>

      <Button type="submit" className="bg-primary hover:bg-primary/90 text-white mt-2">
        Próximo
      </Button>
    </form>
  )
}
