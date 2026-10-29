import { dinheiro, horarioEntrega, nomeEntrega, type ServicoEntrega } from '../delivery';
import './delivery.css';
export default function DeliveryBadge({ servico }: { servico?: ServicoEntrega }) {
  if (!servico) return null;
  return <div className={`delivery-service ${servico.tipo === 'EXPRESS' ? 'delivery-service--express' : ''}`}>
    <strong>{servico.tipo === 'EXPRESS' ? '⚡ EXPRESS · Rápida' : nomeEntrega[servico.tipo]}</strong>
    <span>{servico.agendadoPara ? 'Agendada para ' : `Até ${servico.prazoMinutos} min · `}{horarioEntrega(servico.previstoPara)}</span>
    <span>{dinheiro(servico.taxa)}{servico.distanciaKm !== undefined ? ` · ${servico.distanciaKm.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} km` : ''}</span>
    {servico.avisoLocalizacao && <span role="status">{servico.avisoLocalizacao}</span>}
  </div>;
}
