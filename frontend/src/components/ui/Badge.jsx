import dotIn from '../../assets/icons/dot-in.svg'
import dotOut from '../../assets/icons/dot-out.svg'
import dotReserve from '../../assets/icons/dot-reserve.svg'
import dotAdjust from '../../assets/icons/dot-adjust.svg'
import './Badge.css'

const KINDS = {
  IN: { className: 'badge-in', dot: dotIn },
  OUT: { className: 'badge-out', dot: dotOut },
  RESERVE: { className: 'badge-reserve', dot: dotReserve },
  ADJUST: { className: 'badge-adjust', dot: dotAdjust, text: 'COUNT' },
}

// Transaction type. IN adds stock, OUT removes stock, RESERVE holds stock until it's confirmed out,
// ADJUST (shown as COUNT) sets the balance to a physical count.
export default function Badge({ kind }) {
  const label = KINDS[kind] ? kind : 'IN'
  const { className, dot, text = label } = KINDS[label]
  return (
    <span className={`badge ${className}`}>
      <img src={dot} alt="" width="6" height="6" />
      {text}
    </span>
  )
}
