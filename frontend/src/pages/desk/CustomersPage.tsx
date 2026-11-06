import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchCustomers } from '../../api/customers';
import { NewCustomerModal } from '../../components/desk/NewCustomerModal';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  SkeletonCards,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/** Customers: search by name, email or a full mobile number; register walk-ins. */
export default function CustomersPage() {
  useDocumentTitle('Customers');
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const list = useQuery({
    queryKey: ['desk-customers', term],
    queryFn: () => searchCustomers(term),
  });

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="Customers"
        description="Search by name, email or a full 10-digit mobile number."
        actions={
          <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setRegistering(true)}>
            Register customer
          </Button>
        }
      />
      <div className="max-w-xl">
        <Input
          label="Search customers"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Name, email or mobile number"
          autoComplete="off"
        />
      </div>

      {list.isPending ? (
        <SkeletonCards count={4} label="Loading customers…" />
      ) : list.isError ? (
        <ErrorState
          description="We couldn't load the customers."
          onRetry={() => void list.refetch()}
        />
      ) : list.data.results.length === 0 ? (
        <EmptyState
          icon={term ? <Search className="h-6 w-6" /> : <Users className="h-6 w-6" />}
          title={term ? `No customers match “${term}”` : 'No customers yet'}
          description={
            term
              ? 'Check the spelling, or type the full mobile number. You can also register a new customer.'
              : 'Customers appear here when they sign up or when you register a walk-in.'
          }
          action={
            <Button variant="secondary" onClick={() => setRegistering(true)}>
              Register customer
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-md md:grid-cols-2">
          {list.data.results.map((customer) => (
            <li key={customer.id}>
              <Card variant="plain" padding="md" as="article" className="h-full">
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-text">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="rounded focus-visible:shadow-focus focus-visible:outline-none hover:underline"
                      >
                        {customer.full_name || customer.email}
                      </Link>
                    </h2>
                    <p className="truncate text-sm text-text-muted">{customer.email}</p>
                    <p className="text-sm text-text-muted">{customer.phone}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {customer.has_allergies && <Badge tone="warning">Allergies</Badge>}
                    <span className="text-xs text-text-muted">
                      {customer.visits ?? 0} visit{customer.visits === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {registering && (
        <NewCustomerModal
          onClose={() => setRegistering(false)}
          onCreated={(customer) => navigate(`/customers/${customer.id}`)}
        />
      )}
    </section>
  );
}
