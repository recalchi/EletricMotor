## O que muda

## Testes (docs/test-plans/README.md)
- [ ] Teste novo/atualizado que falharia sem esta mudança
- [ ] `npm test`, `npm run lint` e `npm run build` passando (o CI confere)
- [ ] Firmware/catálogo: `FW_VERSION` = última do catálogo e arquivos em `public/firmware` conferidos (`npm test`)
- [ ] Bancada, se mexeu em firmware ou gravação: `npm run hw:smoke` / `npm run hw:flash` — cole o resultado
- [ ] Roteiro manual: itens afetados conferidos (web e/ou APK)

## Não testado / riscos
