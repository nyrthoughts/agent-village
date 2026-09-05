export type Language = 'fr' | 'en';
export const LANGUAGE_KEY = 'agent-village:language';

// UI copy only. Never translate or send conversation content to a remote service.
const english = {
  'ACCÈS PERSONNEL': 'PERSONAL ACCESS',
  'Votre village, votre clé.': 'Your village, your key.',
  'Les projets restent derrière cette porte. Aucune conversation n’est chargée avant votre authentification.': 'Your projects stay behind this door. No conversations are loaded before you authenticate.',
  'Vérification de l’accès…': 'Checking access…',
  'Accès indisponible. Le village reste verrouillé.': 'Access unavailable. The village remains locked.',
  'Code absent, expiré ou incorrect. Relancez la configuration locale.': 'Setup code missing, expired or incorrect. Run local setup again.',
  'Authentification non terminée. Vous pouvez réessayer.': 'Authentication was not completed. You can try again.',
  'Code de configuration privé': 'Private setup code',
  'Première visite : utilisez le code local bootstrap.txt, puis créez votre clé d’accès. Ne partagez pas ce code.': 'First visit: use your local bootstrap.txt code, then create your passkey. Do not share this code.',
  'La configuration locale doit être lancée avant la première visite.': 'Run local setup before your first visit.',
  'Ce navigateur ne propose pas les clés d’accès. Ouvrez cette adresse dans Chrome ou Safari sur ce Mac.': 'This browser does not support passkeys. Open this address in Chrome or Safari on this Mac.',
  'Validation en cours…': 'Verifying…',
  'Ouvrir mon village': 'Open my village',
  'Créer ma clé d’accès': 'Create my passkey',
  'Clé d’accès requise · session de 30 minutes · aucun mot de passe stocké': 'Passkey required · 30-minute session · no stored password',
  'Cet accès est local à ce Mac. La démo GitHub publique ne contient pas vos conversations.': 'This access is local to this Mac. The public GitHub demo does not contain your conversations.',
  'Réessayer': 'Try again',
  'Verrouiller': 'Lock',
  'Journal du village': 'Village journal',
  'Votre point de départ': 'Start here',
  'À lire en premier': 'Read first',
  'Derniers signalements, pas des priorités déduites.': 'Recent reports, not inferred priorities.',
  'Lire le point de {name}': 'Read the update from {name}',
  'Blocage déclaré': 'Reported blocker',
  'Suite annoncée': 'Stated next step',
  'Compte rendu récent': 'Recent report',
  'Aucun nouveau compte rendu dans les sources lues. Les projets restent consultables.': 'No new reports in the scanned sources. Projects are still available.',
  'Sources et confidentialité': 'Sources and privacy',
  'Agent Village privé': 'Private Agent Village',
  'AGENT VILLAGE / LOCAL PRIVÉ': 'AGENT VILLAGE / LOCAL ONLY',
  'Mes projets, maintenant': 'My projects, right now',
  'projets': 'projects',
  'agents en cours': 'agents working',
  'Lu à': 'Read at',
  'actualisation 5 s': 'refreshes every 5 s',
  'Les données déjà lues restent affichées.': 'Previously read data remains visible.',
  'Projets connectés': 'Connected projects',
  'Revenir aux {count} projets suivis': 'Back to {count} tracked projects',
  'Voir aussi les {count} autres projets': 'Show the other {count} projects',
  'Rechercher un projet': 'Search projects',
  'Projet…': 'Project…',
  'Ouvrir {name}': 'Open {name}',
  'en cours': 'working',
  'en attente': 'waiting',
  'Derniers échanges': 'Recent updates',
  'nouveaux échanges': 'new updates',
  'Ouvrir les sessions': 'Open sessions',
  'Bâtiments de mes projets': 'My project buildings',
  '{count} projets récents sur la carte · recherche pour les autres. Chantier = activité, pas livraison.': '{count} recent projects on the map · search for the others. Construction means activity, not delivery.',
  'Les résumés sont les déclarations des agents, non des résultats vérifiés. Rien n’est envoyé à GitHub.': 'Summaries are agent reports, not verified results. Nothing is sent to GitHub.',
  'Les conversations sources restent dans leur langue d’origine.': 'Source conversations stay in their original language.',
  'Projet connecté': 'Connected project',
  'Fermer le projet': 'Close project',
  'Vue du projet': 'Project view',
  'Bilan': 'Brief',
  'Évolution': 'Timeline',
  'Conversations': 'Conversations',
  'Marquer comme lu': 'Mark as read',
  'nouveaux échanges depuis le dernier point de lecture.': 'new updates since the last reading point.',
  'Bilan du projet': 'Project brief',
  'Extraits des derniers comptes rendus par conversation, datés et consultables. Pas de pourcentage déduit de l’activité.': 'Excerpts from the latest report in each conversation, with dates and source links. Activity is not converted into a completion percentage.',
  'Aucun compte rendu textuel dans la fenêtre lue. Les sessions et leur état restent accessibles.': 'No text reports in the scanned window. Sessions and their states remain available.',
  'Fait — déclaré par les agents': 'Done — reported by agents',
  'Suite explicitement annoncée': 'Explicit next steps',
  'Blocages explicitement signalés': 'Explicitly reported blockers',
  'Ce qui a changé': 'What changed',
  'Chronologie réunie de toutes les conversations du projet. Les changements d’état seuls ne sont pas comptés comme du travail livré.': 'Combined timeline of all project conversations. State changes alone do not count as delivered work.',
  'Compte rendu': 'Report',
  'Demande': 'Request',
  'Terminal tmux :': 'tmux terminal:',
  'Dernière demande': 'Latest request',
  'Dernier compte rendu de l’agent': 'Latest agent report',
  'Historique récent': 'Recent history',
  'En cours': 'Working',
  'En attente': 'Waiting',
  'Sans activité récente': 'No recent activity',
  'État non confirmé': 'Unconfirmed state',
  'Recentrer le village': 'Reset village view',
  'Glisser ou utiliser les flèches pour explorer': 'Drag or use arrow keys to explore',
  'Village pixel {name}': '{name} pixel village',
  'Responsable {name}.': 'Owner {name}.',
  'Sans responsable.': 'No owner.',
  '7 jours · 24 derniers échanges par session · lecture bornée à 4 Mio par journal': '7 days · latest 24 updates per session · reads limited to 4 MiB per log',
  'Journal Codex local · état du dernier événement, pas une preuve de livraison': 'Local Codex log · latest event state, not proof of delivery',
  'Historique Claude · aucun processus associé confirmé': 'Claude history · no associated process confirmed',
  'Événement de cycle de vie local': 'Local lifecycle event',
  'Codex : certains journaux sont illisibles': 'Codex: some logs cannot be read',
  'Codex : index local inaccessible': 'Codex: local index unavailable',
  'Claude : certains journaux sont illisibles': 'Claude: some logs cannot be read',
  'Claude : journaux locaux inaccessibles': 'Claude: local logs unavailable',
  'Processus Claude présent · statut déclaré : {status}': 'Claude process present · reported state: {status}',
  'non fourni': 'not provided',
  'Vous': 'You',
  'Visiter le village': 'Visit the village',
  'Quitter la visite': 'Leave visit mode',
  'Apparence': 'Appearance',
  'Apparence de votre avatar': 'Your avatar appearance',
  'Fougère': 'Fern',
  'Soleil': 'Sun',
  'Iris': 'Iris',
  'Arrêter': 'Stop walking',
  'Destination inaccessible.': 'Destination is not reachable.',
  'Déplacement arrêté.': 'Movement stopped.',
  'Vous êtes arrivé.': 'You have arrived.',
  'Cliquer au sol pour marcher, sur une maison pour la visiter.': 'Click the ground to walk, or a house to visit it.',
  'Cliquer sur une maison pour ouvrir son bilan.': 'Click a house to open its brief.',
  'Flèches : marcher · Échap : arrêter · Glisser : caméra': 'Arrows: walk · Escape: stop · Drag: camera',
} as const;

export function translate(language: Language, key: keyof typeof english, values: Record<string, string | number> = {}): string {
  return (language === 'en' ? english[key] : key).replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}

// Server metadata predates localization. Translate only recognized system messages,
// never apply this to user titles, summaries, or conversation excerpts.
export function translateDiagnostic(language: Language, value: string): string {
  if (Object.hasOwn(english, value)) return translate(language, value as keyof typeof english);
  const prefix = 'Processus Claude présent · statut déclaré : ';
  if (value.startsWith(prefix)) {
    const status = value.slice(prefix.length);
    return translate(language, 'Processus Claude présent · statut déclaré : {status}', { status: status === 'non fourni' ? translate(language, 'non fourni') : status });
  }
  return value;
}

export function savedLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'fr'; }
  catch { return 'fr'; }
}
