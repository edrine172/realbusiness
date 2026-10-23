from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from inventory.models import SecurityAuditEvent


class Command(BaseCommand):
    help = 'Promote an existing account to the first active Django superuser.'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--confirm-username', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        username = options['username']
        if options['confirm_username'] != username:
            raise CommandError('--confirm-username must exactly match --username.')

        User = get_user_model()
        try:
            user = User.objects.select_for_update().get(username=username)
        except User.DoesNotExist as exc:
            raise CommandError(f'No account named "{username}" exists; no changes were made.') from exc

        if not user.is_active:
            raise CommandError(f'Account "{username}" is inactive; no changes were made.')
        if user.is_superuser:
            self.stdout.write(self.style.SUCCESS(f'"{username}" is already a superuser.'))
            return
        if User.objects.filter(is_active=True, is_superuser=True).exists():
            raise CommandError('An active superuser already exists; use that account to manage access.')

        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=['is_staff', 'is_superuser'])
        SecurityAuditEvent.objects.create(
            actor=user,
            action='user.superuser.bootstrapped',
            target_type='user',
            target_id=str(user.pk),
            details={'username': user.get_username()},
        )
        self.stdout.write(self.style.SUCCESS(f'"{username}" is now a Django superuser.'))
