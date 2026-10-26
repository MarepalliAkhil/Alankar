from django.contrib import admin

from website.models import Achievement, KnowledgeEntry, Offer, SiteContent

admin.site.register(SiteContent)
admin.site.register(Achievement)
admin.site.register(Offer)
admin.site.register(KnowledgeEntry)
