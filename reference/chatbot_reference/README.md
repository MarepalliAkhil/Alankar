# chatbot_reference

Reference implementation of **AI Alankar Intelligence** (pure Python standard library, no models, no API keys).

```
python -m unittest discover -s tests -v
python -c "from alankar_intelligence import Engine; e=Engine.from_seed(); r=e.answer('cost of body massge'); print(r.rephrased); print(r.text)"
```
Read `CHATBOT_ALGORITHM.md` first. Port this package into `backend/chatbot/` in the Django project and replace the seed JSON files with database-backed data.
