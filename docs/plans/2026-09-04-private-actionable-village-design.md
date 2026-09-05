# Agent Village — cockpit privé, synthèses et visite du village

Statut : accès sécurisé, personnage et refonte visuelle validés par le propriétaire le 4 septembre 2026. Synthèses externes désactivées, choix du traitement des conversations non autorisé. Implémentation en cours, pas encore déployée.

## Résultat attendu

En moins d'une minute, comprendre ce qui a changé, ce qui exige une décision et où reprendre. Le village sert la navigation ; se déplacer ne doit jamais être obligatoire pour obtenir l'information. Conserver le français et l'anglais.

## Diagnostic vérifié le 4 septembre 2026

- Base : commit `423d050`, checkout propre avant cette étude.
- `projectBrief.ts` extrait les derniers messages et reconnaît certains titres. Ce n'est pas une synthèse sémantique.
- Les sources sont relues : sept jours, 24 échanges par session, quatre Mio en fin de journal. Seul le point de lecture est mémorisé dans le navigateur.
- `VillageMap2D.tsx` déplace la caméra ; aucun personnage utilisateur ni trajet n'existe.
- Le village natif place les maisons en rangées régulières avec des chemins horizontaux séparés. La composition explique en partie l'aspect répétitif.
- L'API native a répondu HTTP 200 sans authentification. Le processus écoute uniquement sur `127.0.0.1:4180`.
- Les routes de hooks acceptent des observations, pas des commandes. Elles n'ont actuellement pas de secret d'ingestion.
- La démo publique et le cockpit natif sont distincts. Les données privées ne doivent jamais entrer dans les artefacts GitHub Pages.

## Parcours proposé

1. Ouvrir et s'authentifier avec l'identité propriétaire enregistrée localement.
2. Lire un briefing court : décisions explicites, blocages signalés, changements depuis la dernière visite. Maximum trois éléments prioritaires, autres éléments accessibles.
3. Chaque élément indique projet, source datée, origine déclarative et prochaine action réellement étayée. Pas de priorité inventée quand les sources ne suffisent pas.
4. Cliquer directement sur le projet, ou activer le mode visite. Cliquer au sol déplace le personnage ; cliquer sur une maison conduit à sa porte puis ouvre son bilan.
5. Le bilan présente résultat, reste à faire, blocage et sources. Historique complet disponible en second niveau, pas en mur de texte à l'arrivée.

## Direction visuelle

Pixel art original inspiré de la composition Gen III : place centrale, chemins reliés et irréguliers, maisons aux silhouettes distinctes, forêt dense en profondeur, berges et petits repères. Réduire les panneaux couvrant la carte. Personnage principal distinct des agents adultes et sous-agents enfants. Aucun asset Pokémon/Dofus copié. Conserver React et le moteur de coordonnées existant ; pas de nouveau moteur de jeu.

Le trajet contourne maisons, forêt et eau. Un clic pendant la marche remplace la destination. Pas de déplacement après glisser-déposer de caméra. Navigation clavier, consultation directe, mouvement réduit et mobile restent disponibles.

## Sécurité : modèle de menace et limites

Protection visée : visiteur anonyme, autre compte local, site malveillant, falsification des observations, instruction injectée dans un journal. Ne pas prétendre protéger les journaux source contre un malware ayant déjà les droits du propriétaire sur le Mac.

- Cockpit natif local, aucune ouverture réseau ni tunnel public.
- Un propriétaire, pas d'inscription publique. Enrôlement à usage unique déclenché localement, fermé ensuite.
- Passkey avec vérification utilisateur ; compatibilité réelle du navigateur Codex à vérifier avant de retenir l'enrôlement final. L'utilisateur réalise lui-même le geste biométrique. Pas de repli silencieux vers une authentification plus faible.
- Sessions côté serveur, rotation, expiration et déconnexion. Sur loopback, éviter un cookie ambiant partagé entre ports : privilégier un jeton court conservé uniquement en mémoire de la page, envoyé explicitement dans Authorization, origine exacte et CORS fermé. Nouvelle authentification après rechargement ; coût UX assumé. Cette option augmente l'importance de prévenir XSS : texte source rendu comme texte, CSP restrictive, aucune dépendance distante ni HTML issu du modèle. Ne pas prétendre qu'un nom de cookie aléatoire ou une signature isole les ports.
- APIs natives refusées sans session avant toute lecture des sources. Erreur de configuration = accès fermé, jamais repli vers l'ancien mode non authentifié.
- Hooks sur une autorisation d'ingestion distincte : elle ne permet ni lecture ni administration. Rejets des secrets absents/erronés, limites de taille, fréquence et validation stricte.
- Refuser les événements de hook inconnus : la revue isolée a confirmé qu'un nom arbitraire était actuellement converti en activité « en cours ». Borner le nombre d'observations retenues et tester les flux HTTP interrompus/trop longs avant livraison.
- Aucun endpoint permettant de démarrer, arrêter, relancer ou donner des ordres à Codex/Claude. Le modèle de synthèse ne reçoit aucun outil ni commande shell.
- Données et configuration privées hors repo. Aucune télémétrie de conversation ajoutée.

## Synthèse et mémoire

Une synthèse utile ne doit pas être confondue avec un assemblage d'extraits. Produire un résultat structuré par projet, bref et accompagné des identifiants des sources présentes dans l'entrée. Signaler conflits, manque de preuves et ancienneté. Un lien de source ne prouve pas à lui seul que l'interprétation du modèle est correcte : conserver le statut « synthèse générée / à vérifier » et tester la fidélité.

Sources brutes inchangées. Cache de synthèse privé et borné, indexé par empreinte des échanges, langue et version du modèle/prompt. Recalcul seulement sur changement ou demande ; aucun appel de modèle toutes les cinq secondes. Historique limité des synthèses pour comparer les changements ; afficher les trous de couverture au lieu de prétendre posséder toute la mémoire.

Trois options :

- Recommandation sous consentement explicite : inférence hébergée à la demande sur les seuls extraits nécessaires, avec cache local. Pas de poids de modèle sur le Mac, mais données transmises au fournisseur choisi. Le compte Claude actuellement connecté est un compte d'équipe, pas un compte personnel à présumer.
- Tout local : modèle chargé à la demande, puis libéré. Aucun envoi mais consommation de disque/RAM et qualité à mesurer. Ne rien télécharger avant accord sur cette ressource.
- Extraction déterministe : aucune inférence ni transfert. Repli honnête en cas d'indisponibilité ; ne satisfait pas à elle seule la demande de véritable synthèse.

L'autorisation de la revue de conception par Claude ne vaut pas consentement à l'envoi automatique des conversations privées. Aucun fournisseur de synthèse activé avant ce choix, aucun paiement supplémentaire implicite.

## Lots et preuves de fin

1. Fermer l'accès : tests API sans session/avec mauvaise session, expiration et déconnexion, enrôlement unique, rejet inter-origines, ingestion distincte, absence de commandes. Puis tester l'authentification réelle par le propriétaire.
2. Construire le briefing et la mémoire : jeux de données fictifs FR/EN, contradictions, sources supprimées/périmées, injections, résumé sans preuve, validation stricte et cache borné. Évaluer des synthèses réelles seulement avec consentement au traitement.
3. Livrer la visite et le visuel : trajets accessibles à chaque porte, collisions, changements de destination, mobile et mouvement réduit ; captures bureau/mobile et inspection visuelle.
4. Vérifier puis mettre à jour le runtime privé. La démo publique ne contient que les données fictives. Revue du diff, tests unitaires, parcours navigateur et contrôle des artefacts avant toute publication.

## Références de conception

- [Linear Pulse](https://linear.app/docs/pulse) : séparer les mises à jour détaillées du résumé de rattrapage.
- [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) et [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- [SimpleWebAuthn](https://simplewebauthn.dev/docs/packages/server) et [exemple localhost](https://simplewebauthn.dev/docs/advanced/example-project). La documentation ne prouve pas la compatibilité du navigateur intégré utilisé.
- [OWASP LLM Prompt Injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) : instructions des sources non fiables et pouvoirs du modèle minimaux.

## Revue indépendante

Claude Fable 5.1 a répondu via Claude Code, modèle confirmé `claude-fable-5-1`, sans outils ni agents imbriqués et sans envoi de conversations privées. Session de revue : `c186c2d7-b8c8-4378-a882-ceb353ca7d4d`, fin normale en environ 70 secondes. Il a reçu un état technique fourni, pas un accès au dépôt : ce n'est pas un audit du code.

Corrections retenues :

- Premier enrôlement protégé par une preuve locale à usage unique, jamais « premier arrivé devient propriétaire ».
- Les cookies localhost ne sont pas isolés par port. Rejeter l'idée que signature + nom aléatoire + contrôle Origin suffisent à empêcher toute capture/relecture par un serveur local hostile.
- Autoriser le briefing à ne rien conclure si les sources sont trop faibles ; indiquer explicitement les contradictions et l'ancienneté. Ne pas appliquer un seuil arbitraire de 48 heures à tous les projets sans contexte.
- Résumeur sans outils, schéma strict, références à des sources réellement présentes, citation exacte vérifiée. Le contrôle de citation n'établit pas la vérité de l'interprétation.
- Séparer la marche du personnage de l'actualisation des sources ; un rafraîchissement ne réinitialise ni avatar ni destination.

Limites corrigées dans la recommandation Claude : « confidentialité totale » n'est pas une garantie locale ; « aucune nouvelle facture » ne découle pas d'un abonnement existant. L'utilisation du compte Claude d'équipe et le transfert de sources Codex exigent un choix explicite. Ne pas appliquer sa suggestion de livrer uniquement l'extracteur à la place de la synthèse demandée : l'objectif complet reste actif.
