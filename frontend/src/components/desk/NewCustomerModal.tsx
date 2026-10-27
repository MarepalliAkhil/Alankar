import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { createCustomer, type CustomerDetail } from '../../api/customers';
import { Button, Input, Modal, Textarea, useToast } from '../ui';

const mobile = /^(\+?91)?[\s-]?[6-9]\d{4}[\s-]?\d{5}$/;

/** Register a walk-in or phone customer at the desk. They claim the account later by email. */
export function NewCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (customer: CustomerDetail) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [allergies, setAllergies] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createCustomer({
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        allergies: allergies.trim(),
      }),
    onSuccess: (customer) => {
      toast.show({ tone: 'success', title: `${customer.full_name} registered` });
      onCreated(customer);
    },
    onError: (error) =>
      setProblem(genericErrorMessage(error, 'Could not register. Please try again.')),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Enter the full name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!mobile.test(phone.trim())) next.phone = 'Enter a valid 10-digit mobile number.';
    setErrors(next);
    setProblem('');
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Register a customer"
      description="For walk-ins and phone bookings. The customer sets a password later with “Forgot password”."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" form="new-customer-form" loading={create.isPending}>
            Register customer
          </Button>
        </>
      }
    >
      <form id="new-customer-form" onSubmit={submit} noValidate className="flex flex-col gap-md">
        <Input
          label="Full name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          autoComplete="off"
        />
        <Input
          label="Email"
          type="email"
          required
          hint="Receipts and booking emails go here."
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          autoComplete="off"
        />
        <Input
          label="Mobile number"
          type="tel"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          error={errors.phone}
          autoComplete="off"
        />
        <Textarea
          label="Allergies (optional)"
          maxLength={500}
          value={allergies}
          onChange={(event) => setAllergies(event.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}
