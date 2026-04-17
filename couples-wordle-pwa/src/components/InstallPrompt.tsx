import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  onDismiss: () => void;
}

export function InstallPrompt({ onDismiss }: Props) {
  return (
    <Card className="space-y-2 bg-white/90 backdrop-blur">
      <p className="font-heading text-sm font-semibold">Add to Home Screen</p>
      <ol className="list-inside list-decimal space-y-1 text-xs text-textSecondary">
        <li>Tap the Share button in Safari.</li>
        <li>Choose &ldquo;Add to Home Screen&rdquo;.</li>
        <li>Open from your Home Screen for full-screen play and notifications.</li>
      </ol>
      <Button variant="ghost" onClick={onDismiss} className="w-full">
        Got it
      </Button>
    </Card>
  );
}
