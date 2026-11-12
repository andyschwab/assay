# a snake_case credential assigned a literal
db_password = "Inert0Planted"


def connect(host):
    return {"host": host, "password": db_password}
