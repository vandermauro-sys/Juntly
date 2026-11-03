import { Link } from 'react-router-dom'

export default function Logo({ to = '/' }) {
  return (
    <Link to={to} className="brand">
      <img src="/icon.svg" alt="" />
      Juntly
    </Link>
  )
}
