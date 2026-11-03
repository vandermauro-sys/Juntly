# Juntly

**Viaje junto, volte com tudo.** App para agências que levam grupos (corporativo, incentivo, missões empresariais): agenda ao vivo, avisos, check-in por QR, documentos, guia, galeria com "minhas fotos" e pesquisa de satisfação. Em português, inglês e espanhol.

Stack: React + Vite (PWA instalável) · Supabase (banco, login, storage, tempo real) · Vercel.

## O que já funciona

**Painel da agência** (`/admin`, login por link no e-mail)
- Agência com logo e cor própria (aparecem no app do participante) e equipe com papéis (dono, administrador, coordenador)
- Viagens com código de 6 letras, link e QR code de entrada, envio por WhatsApp
- Participantes: cadastro manual, importação por planilha CSV (modelo incluso), exportação, grupos/ônibus e quartos
- Agenda por dia, por grupo, com "o que levar" e endereço; ao editar, avisa o grupo automaticamente
- Avisos para todos ou para um grupo, com marcação de urgente
- Documentos exigidos (passaporte, ESTA/visto, seguro já vêm prontos) e quadro de quem já entregou
- Check-in: pontos de check-in, leitura do QR do participante pela câmera ou toque na lista, quem falta com botão de ligar, sincronização entre coordenadores em tempo real e **fila sem internet**
- Ocorrências (atraso, saúde, reclamação)
- Galeria: envio de várias fotos (redimensionadas no aparelho) e marcação de quem aparece
- Guia da viagem (com modelo pronto) e pesquisa de satisfação com nota média, NPS e exportação

**App do participante** (`/j/CÓDIGO`, sem senha)
- Entra com nome e celular; se a agência já importou a pessoa, o cadastro é reconhecido pelo telefone ou e-mail
- Agenda do dia com destaque do que está acontecendo agora, botão de rota e atualização ao vivo
- Avisos ao vivo, com alerta no navegador
- Meu passe: QR para check-in, grupo, quarto, checklist de documentos, telefone de emergência
- Fotos: "minhas fotos" e todas, download/compartilhar direto do celular
- Guia, pesquisa no fim da viagem, troca de idioma e de autorização de imagem
- Abre a última versão salva quando está sem internet

## Como colocar no ar

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **SQL Editor**, cole e rode o arquivo `supabase/schema.sql` inteiro.
3. Em **Authentication → Sign In / Providers**, ative **Allow anonymous sign-ins** (é assim que o participante entra sem senha).
4. Em **Authentication → URL Configuration**, coloque a URL do site (ex.: `https://juntly.vercel.app`) em *Site URL* e adicione `https://SEU-DOMINIO/admin` em *Redirect URLs*. Para testar no computador, adicione também `http://localhost:5173/admin`.
5. Em **Project Settings → API**, copie a *Project URL* e a chave *anon public*.

### 2. Rodar no computador
```bash
npm install
cp .env.example .env   # preencha com a URL e a chave anon
npm run dev
```

### 3. Vercel
Importe o repositório na Vercel, adicione as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e faça o deploy. O `vercel.json` já cuida das rotas.

### Primeiro uso
1. Abra `/login`, entre com seu e-mail e crie a agência.
2. Para adicionar um coordenador: ele entra uma vez pelo `/login`, e depois você adiciona o e-mail dele em **Agência e equipe**.
3. Crie a viagem, importe a lista e compartilhe o link ou QR com o grupo.

## Testes
```bash
npm run test:db   # 41 testes das regras de acesso do banco (roda um Postgres embutido)
```
Cobrem, entre outros: participante só vê a própria viagem, não edita agenda nem avisos, não troca de grupo nem de viagem; estranhos não veem nada; coordenador não apaga viagens; fotos privadas no storage.

## Próximos passos (fora deste MVP)
- **Busca de fotos por rosto**: hoje a equipe marca quem aparece em cada foto. O próximo passo é ligar uma API de reconhecimento facial (só para quem autorizou) para marcar automaticamente. Exige revisão jurídica (LGPD e leis estaduais de biometria nos EUA).
- **Notificações push com o app fechado** (Web Push com chaves VAPID e uma função no servidor). Hoje o alerta chega com o app aberto ou em segundo plano no navegador.
- Rooming list automática, loja de opcionais com pagamento, link do fornecedor e relatório final para a empresa contratante (Fase 2 do roadmap).
- Antes do lançamento: termos de uso e política de privacidade, e decidir se pessoas que não autorizaram imagem devem ser ocultadas da galeria geral.
