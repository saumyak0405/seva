import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export function NotFoundPage() {
  return (
    <Empty title="Page not found">
      <Link to="/" className="text-brand-700 hover:underline">
        Go home
      </Link>
    </Empty>
  );
}
