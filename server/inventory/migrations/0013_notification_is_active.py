from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0012_notification'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]