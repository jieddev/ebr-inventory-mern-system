import dotIn from '../../assets/icons/dot-in.svg'
import dotOut from '../../assets/icons/dot-out.svg'
import './Badge.css'

// Transaction type. IN adds stock, OUT removes stock.
export default function Badge({ kind }) {
  const isOut = kind === 'OUT'
  return (
    <span className={`badge ${isOut ? 'badge-out' : 'badge-in'}`}>
      <img src={isOut ? dotOut : dotIn} alt="" width="6" height="6" />
      {isOut ? 'OUT' : 'IN'}
    </span>
  )
}
