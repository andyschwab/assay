from openai import OpenAI

client = OpenAI()

def answer(question):
    return client.chat.completions.create(model="a-model", messages=[{"role": "user", "content": question}])
