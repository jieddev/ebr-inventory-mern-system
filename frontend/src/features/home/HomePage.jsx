import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { useAuth } from '../auth/useAuth'
import './HomePage.css'

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <section className="home-page">
      <header className="home-header">
        <div>
          <h1>Welcome, {user.name}</h1>
          <p>You are signed in to the EBR Inventory System.</p>
        </div>

        {user.role === 'admin' && <Button onClick={() => navigate('/users/new')}>Create user</Button>}
      </header>
    </section>
  )
}
