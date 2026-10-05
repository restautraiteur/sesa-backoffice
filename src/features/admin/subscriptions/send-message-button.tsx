import { MessageCircle, MessageSquareText, Send } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import { smsLink, whatsappLink } from "@/features/admin/subscriptions/api";

/** Bouton qui propose d'envoyer un message prêt à l'emploi par SMS ou par WhatsApp. */
export function SendMessageButton({
  phone,
  text,
  label,
  title,
  iconOnly = false,
  className,
}: {
  phone: string;
  text: string;
  label?: string;
  /** Infobulle et nom accessible (bouton icône). */
  title?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={iconOnly ? "icon" : "sm"}
          variant={iconOnly ? "ghost" : "outline"}
          className={className}
          aria-label={iconOnly ? title : undefined}
          title={title}
        >
          <Send className="size-4" />
          {!iconOnly && label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={smsLink(phone, text)}>
            <MessageSquareText className="size-4" /> Par SMS
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={whatsappLink(phone, text)} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" /> Par WhatsApp
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
