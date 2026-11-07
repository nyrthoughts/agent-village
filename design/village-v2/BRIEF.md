Conçois Agent Village, le tableau de bord permanent où je retrouve tous mes agents et mes conversations, regroupés par projet.

## Le produit
Agent Village réunit mes chats et mes agents venant de l'app Codex, de l'app Claude et de Claude Code CLI. L'unité principale est le projet, pas l'outil. Chaque projet a son contexte : objectif, décisions, repo lié, chats, tâches, artefacts et dernière activité.

L'écran est un village ou un bureau vivant, isométrique, interactif, qui ressemble à un jeu. Chaque projet a son bâtiment ou sa zone, avec des variations de décor et d'animation propres. Tout partage la même direction artistique et la même grammaire d'animation : pas de mondes sans rapport entre eux.

Les bots se déplacent, travaillent et réagissent selon leur état. La scène occupe la majorité de l'écran tout en portant des infos utiles. Le chrome autour est sombre, presque noir, lisible, proche de l'interface X / Grok.

Une zone « À toi » montre ce qui attend mon attention. Ces trois cas doivent se distinguer clairement : approbation demandée, information demandée, erreur. Cliquer sur un agent ou un projet ouvre la source : transcript, tâche ou contexte.

## Ce que je ne veux pas
- Un dashboard qui n'est qu'un feed, ou des cartes SaaS génériques.
- Les petites maisons CSS sur une grille vide de la PR actuelle.
- Du pixel art générique.
- Du CSS qui essaie d'imiter une illustration raster détaillée.
- Une capture d'écran aplatie présentée comme le produit.

## Code existant
- Repo : https://github.com/nyrthoughts/agent-village
- PR #2 : https://github.com/nyrthoughts/agent-village/pull/2. Son rendu visuel n'est pas au niveau. Elle ne sert pas de direction artistique.
- La démo publique montre `main`, pas la PR : https://nyrthoughts.github.io/agent-village/

## Références
Ce sont des inspirations tierces, pas des assets dont j'ai les droits. Crée des assets originaux. Ne copie ni logos, ni personnages, ni décors. Si tu ne peux pas ouvrir X, utilise les images jointes dans `references/`.

1. Direction principale : bureau isométrique, bots colorés à leurs postes, bulle « Needs you ».
   Tweet : https://x.com/maestrooth/status/2115449438571315234
   Image : https://pbs.twimg.com/amplify_video_thumb/2115449021925924864/img/iTb2fb0NOkIRcZ-1.jpg
2. Bureau orbital isométrique, liste de l'équipe, activité, statuts.
   Tweet : https://x.com/choopyplug1/status/2116308816677470700
   Image : https://pbs.twimg.com/amplify_video_thumb/2116308565660971008/img/pXYikUDTXIYw3lib.jpg
3. Station en modules par métier, panneau Mission Control.
   Tweet : https://x.com/dontstopmirage/status/2117373505738072242
   Image : https://pbs.twimg.com/amplify_video_thumb/2117373455335096320/img/YrpzIebZPxzQ20kr.jpg
   Ses chiffres et ses actions financières ne sont pas vérifiés. Ne les reprends pas.
4. Structure d'information : Waiting on me, Timeline, Status.
   Tweet : https://x.com/byalexai/status/2114837470680318365
   Image : https://pbs.twimg.com/media/HVlpNSBXYAASb30.jpg
5. Étages par équipe, compteurs working/waiting. L'auteur dit lui-même que la vidéo est un rendu promotionnel plus riche que ce qu'on obtient. Sers-t'en pour l'ambiance, pas comme cible réaliste.
   Tweet : https://x.com/0xCarnagee/status/2118142092606046248
   Image : https://pbs.twimg.com/amplify_video_thumb/2118133848730984448/img/GFgpaHc14dAHEkgL.jpg
   Suite du même auteur : https://x.com/0xCarnagee/status/2115623287707381874
6. Dashboards Pages Grok Bot : https://x.com/AlexFinn/status/2115596225793921048. Le prompt Mission Control est dans sa réponse : https://x.com/AlexFinn/status/2115612249826148795
7. Bâtiment navigable par étages, avec statut, usage et demandes en attente : https://x.com/daddycross/status/2117216972484104512
8. Optionnel, pour l'idée de flotte, d'audit et de budget : https://x.com/BrianRoemmele/status/2111201533971103942 et https://x.com/BrianRoemmele/status/2111203787344138339

Référence opérationnelle, pas visuelle, et non testée : Mission Control, https://mc.builderz.dev/ et https://github.com/builderz-labs/mission-control

`references/previous-generated-mockup-not-X.jpg` est une ancienne exploration interne générée. Ce n'est pas une capture X ni une direction validée.

## Méthode d'assets
Produis d'abord de vrais assets image avec tes outils de dessin ou de génération. Si tu ne peux pas générer d'images, dis-le. Liste alors chaque asset nécessaire avec son prompt de génération, sans prétendre l'avoir créé.

- Textes, statuts, clics et layout restent en UI/code. Le SVG et le code conviennent pour les chemins et l'UI.
- Le décor, les bâtiments, les props et les personnages sont des PNG ou WebP transparents séparés.
- Les sprites ont des frames, avec une caméra et une échelle constantes. Pas de halo magenta.
- Aucun secret ni aucun transcript dans les images.

## Étapes
**Étape 1.** Fais une planche contact des références et choisis une direction cohérente : maestrooth en principal, choopy et Mirage pour la spatialité, byalexai pour l'information, Carnage avec la réserve indiquée plus haut.

**Étape 2.** Conçois :
- la scène desktop ;
- le tiroir de contexte du projet sélectionné ;
- les états idle, working, needs-user (approval, input, error distincts) et offline ;
- la version mobile et le mode reduced motion.

Montre-moi les visuels, puis ARRÊTE-TOI. Je dois valider avant toute implémentation ou modification du repo. Pas de code final sans mon accord.

**Étape 3, seulement après validation.** Produis les assets, puis implémente et teste dans le vrai repo, sur une branche. Pas de merge sur `main`.

## Règles de données
- Marque clairement les données de démo.
- Pas de faux pourcentages.
- N'assimile pas l'activité à un commit, une CI ou un déploiement.
- Ne suppose pas que des APIs d'historique existent pour ces apps.
- Distingue l'app Claude de Claude Code CLI, avec un libellé supporté / indisponible.

Les animations restent fluides et légères. Pas de vidéo générée par état.

## Livrable
Un pack de design avec :
- les sources et les attributions ;
- le manifeste des assets (fichier, rôle, taille, ancre, frames) ;
- la typographie, les couleurs et le layout ;
- le contrat d'animation par état ;
- le tout prêt à être repris par Claude Code.
