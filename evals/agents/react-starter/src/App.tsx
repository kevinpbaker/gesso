import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>Hello from React</h1>
      <p>Clicks: {count}</p>
      <button onClick={() => setCount(count + 1)}>Add one</button>
    </main>
  );
}
