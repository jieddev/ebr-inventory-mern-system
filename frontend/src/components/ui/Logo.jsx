import logoImage from '../../assets/images/ebr-logo.png'
import './Logo.css'

export default function Logo({ size = 'md' }) {
  return <img className={`logo logo-${size}`} src={logoImage} alt="The EBR Group" />
}
