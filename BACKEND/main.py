from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


from  db import engine, Base
from routers import auth, users


Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, 
    allow_methods=["*"],
    allow_headers=["*"]
)


app.include_router(auth.router)
app.include_router(users.router)