/**
 * App root: auth context around the data router (router.tsx). Crews land in the tab stacks, hosts in /admin,
 * signed-out visitors on /login.
 */
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { createAppRouter } from './router';
import { FullScreenLoader } from './shell/Guards';

export default function App() {
  const [router] = useState(createAppRouter);
  return (
    <AuthProvider>
      <RouterProvider router={router} fallbackElement={<FullScreenLoader />} future={{ v7_startTransition: true }} />
    </AuthProvider>
  );
}
