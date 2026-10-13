from pathlib import Path
import os
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')
DEBUG = os.environ.get('DEBUG', 'true').lower() in {'1', 'true', 'yes'}
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('SECRET_KEY must be set when DEBUG is disabled.')
    SECRET_KEY = 'django-insecure-local-development-key-change-before-deployment'
ALLOWED_HOSTS = [".onrender.com", '127.0.0.1', 'localhost']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'inventory',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',

]

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'


ROOT_URLCONF = 'config.urls'
TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.debug',
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

POSTGRES_DB = os.environ.get('POSTGRES_DB')
DATABASE_URL = os.environ.get('DATABASE_URL')
DATABASE_ENGINE = os.environ.get('DATABASE_ENGINE', '').lower()
if not DATABASE_ENGINE:
    DATABASE_ENGINE = 'postgresql' if POSTGRES_DB or DATABASE_URL else 'sqlite'

if DATABASE_ENGINE == 'postgresql':
    if DATABASE_URL:
        DATABASES = {
            'default': dj_database_url.config(default=DATABASE_URL, conn_max_age=600)
        }
    elif not POSTGRES_DB:
        raise ImproperlyConfigured('POSTGRES_DB is required when DATABASE_ENGINE is postgresql.')
    else:
        POSTGRES_USER = os.environ.get('POSTGRES_USER')
        POSTGRES_PASSWORD = os.environ.get('POSTGRES_PASSWORD')
        if not POSTGRES_USER or not POSTGRES_PASSWORD:
            raise ImproperlyConfigured('POSTGRES_USER and POSTGRES_PASSWORD are required when DATABASE_ENGINE is postgresql.')
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': POSTGRES_DB,
                'USER': POSTGRES_USER,
                'PASSWORD': POSTGRES_PASSWORD,
                'HOST': os.environ.get('POSTGRES_HOST', '127.0.0.1'),
                'PORT': os.environ.get('POSTGRES_PORT', '5432'),
                'CONN_MAX_AGE': 60,
            },
        }
elif DATABASE_ENGINE == 'sqlite':
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
else:
    raise ImproperlyConfigured('DATABASE_ENGINE must be either postgresql or sqlite.')
AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://ssekanasystems.vercel.app',
]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://ssekanasystems.vercel.app'
]
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAdminUser'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer', 'rest_framework.renderers.BrowsableAPIRenderer'],
}
