import dotIn from '../../assets/icons/dot-in.svg'
import dotOut from '../../assets/icons/dot-out.svg'
import dotReserve from '../../assets/icons/dot-reserve.svg'
import './Badge.css'

const KINDS = {
  IN: { className: 'badge-in', dot: dotIn },
  OUT: { className: 'badge-out', dot: dotOut },
  RESERVE: { className: 'badge-reserve', dot: dotReserve },
}

// Transaction type. IN adds stock, OUT removes stock, RESERVE holds stock until it's confirmed out.
export default function Badge({ kind }) {
  const label = KINDS[kind] ? kind : 'IN'
  const { className, dot } = KINDS[label]
  return (
    <span className={`badge ${className}`}>
      <img src={dot} alt="" width="6" height="6" />
      {label}
    </span>
  )
}
